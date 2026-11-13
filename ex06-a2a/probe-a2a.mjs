#!/usr/bin/env node
/**
 * Ex06 — A2A probe: this example's ONE machine-verification command.
 *
 * Zero dependencies (Node 24 built-ins only). Run from this directory:
 *
 *     node .\probe-a2a.mjs
 *
 * Exit 0 = every external assertion passed; exit 1 = first failed step, with
 * diagnostics. Steps:
 *   1. Pre-flight: agent.yaml exists, Ollama daemon reachable (README prerequisite).
 *   2. Spawns   docker agent serve a2a .\agent.yaml --listen 127.0.0.1:<free-port>
 *   3. Polls GET /.well-known/agent-card.json until 200; asserts card shape, records it.
 *   4. POSTs ONE SendMessage JSON-RPC request to /invoke (A2A v1.0 CamelCase method).
 *   5. Asserts result.task.status.state === TASK_STATE_COMPLETED and that the last
 *      artifact's text parts contain the requested literal ("A2A OK").
 *   6. Kills the whole serve process tree (on Windows the LISTENER is the
 *      docker-agent.exe child, not the `docker` wrapper), verifies the port is freed.
 */
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(SCRIPT_DIR, 'agent.yaml');
const PREFERRED_PORT = 8383;                // picked free at runtime; bumped if taken
const CARD_PATH = '/.well-known/agent-card.json'; // A2A v1.0 discovery path (agent.json is 404)
const TASK = 'Reply with exactly: A2A OK';
const EXPECTED = 'A2A OK';
const CARD_TIMEOUT_MS = 60_000;             // serve startup budget for the agent card
const TURN_TIMEOUT_MS = 240_000;            // one gemma4 model-turn budget

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getFreePort(preferred) {
  return new Promise((resolve, reject) => {
    const tryBind = (port, isRetry) => {
      const srv = net.createServer();
      srv.once('error', (e) => {
        if (isRetry || e.code !== 'EADDRINUSE') return reject(e);
        const srv2 = net.createServer();
        srv2.listen(0, '127.0.0.1', () => { const p = srv2.address().port; srv2.close(() => resolve(p)); });
      });
      srv.listen(port, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
    };
    tryBind(preferred, false);
  });
}

async function fetchTimeout(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

// --- Windows process cleanup: kill the tree, then prove the port is free. ---
function killTree(pid) {
  try {
    spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true });
  } catch { /* best effort; port-owner fallback below */ }
}
function portOwnerPid(port) {
  try {
    const out = execSync(`netstat -ano -p tcp | findstr ":${port} "`, { encoding: 'utf8' });
    const line = out.split(/\r?\n/).find((l) => l.includes('LISTENING'));
    if (!line) return null;
    const pid = line.trim().split(/\s+/).at(-1);
    return /^\d+$/.test(pid) ? pid : null;
  } catch { return null; }
}
async function portIsFree(port) {
  return new Promise((r) => {
    const s = net.createServer();
    s.once('error', () => r(false));
    s.listen(port, '127.0.0.1', () => s.close(() => r(true)));
  });
}
async function ensurePortFreed(port) {
  for (let i = 0; i < 20; i++) {
    if (await portIsFree(port)) return true;
    const pid = portOwnerPid(port);
    if (pid) { try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch { } }
    await sleep(500);
  }
  return await portIsFree(port);
}

function startServe(port) {
  const args = ['agent', 'serve', 'a2a', CONFIG, '--listen', `127.0.0.1:${port}`];
  console.log(`>> spawning: docker ${args.join(' ')}`);
  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const log = [];
  let exited = null;
  for (const stream of ['stdout', 'stderr']) {
    child[stream].on('data', (d) => {
      for (const l of String(d).split(/\r?\n/)) if (l.trim()) log.push(`${stream}: ${l}`);
    });
  }
  child.on('exit', (code, signal) => { exited = `exit code=${code}${signal ? ` signal=${signal}` : ''}`; });
  return {
    pid: child.pid,
    exited: () => exited,
    tail: () => log.slice(-30).join('\n'),
    kill: () => child.pid && killTree(child.pid),
  };
}

let killed = false;
async function cleanup(serve, port) {
  if (killed || !serve) return;
  killed = true;
  const owner = portOwnerPid(port);       // resolve the listener pid BEFORE killing
  serve.kill();                           // taskkill /T /F on the docker wrapper tree
  if (owner && String(owner) !== String(serve.pid)) {
    try { execSync(`taskkill /F /PID ${owner}`, { stdio: 'ignore' }); } catch { }
  }
  await sleep(1_000);
}

async function main() {
  console.log('Ex06 A2A probe — discovery card + one SendMessage round trip (local gemma4, zero deps)');

  // 1. Pre-flight
  if (!fs.existsSync(CONFIG)) throw new Error(`agent.yaml not found at ${CONFIG} — the example under test is missing`);
  try {
    await fetchTimeout('http://localhost:11434/api/tags', {}, 3_000);
    console.log('>> Ollama daemon reachable at localhost:11434');
  } catch {
    throw new Error('Ollama daemon unreachable at localhost:11434 — start it (README prerequisite), then re-run');
  }

  // 2. Serve over A2A on a free loopback port
  const port = await getFreePort(PREFERRED_PORT);
  console.log(`>> port ${PREFERRED_PORT} ${port === PREFERRED_PORT ? 'free, using it' : `busy, using ephemeral ${port} instead`}`);
  const serve = startServe(port);
  const base = `http://127.0.0.1:${port}`;
  try {
    // 3. Poll the agent card until 200
    let card = null;
    const deadline = Date.now() + CARD_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (serve.exited()) throw new Error(`serve a2a exited before opening the card endpoint (${serve.exited()})\n${serve.tail()}`);
      try {
        const res = await fetchTimeout(base + CARD_PATH, {}, 5_000);
        if (res.ok) { card = await res.json(); break; }
        if (res.status === 404) throw new Error(`card endpoint ${CARD_PATH} returned 404 — wrong discovery path? (legacy agent.json is dead)`);
      } catch (e) { if (e.message?.startsWith('serve a2a') || e.message?.includes('404')) throw e; }
      await sleep(500);
    }
    if (!card) throw new Error(`agent card not reachable within ${CARD_TIMEOUT_MS / 1000}s\n${serve.tail()}`);

    // Assert the A2A v1.0 card shape; record the fields the README documents
    if (typeof card.name !== 'string' || !card.name) throw new Error(`card.name missing/not a string: ${JSON.stringify(card.name)}`);
    if (typeof card.version !== 'string' || !card.version) throw new Error(`card.version missing: ${JSON.stringify(card.version)}`);
    const rpc = (card.supportedInterfaces ?? []).find((i) => i.protocolBinding === 'JSONRPC' && String(i.url).includes('/invoke'));
    if (!rpc) throw new Error(`no JSONRPC /invoke entry in supportedInterfaces: ${JSON.stringify(card.supportedInterfaces)}`);
    console.log(`>> card OK: name="${card.name}" version="${card.version}" capabilities=${JSON.stringify(card.capabilities)}`);
    console.log(`>> card supportedInterface: ${JSON.stringify(rpc)}`);

    // 4. ONE SendMessage JSON-RPC call to /invoke (v1.0 CamelCase; message/send is 32601)
    const payload = {
      jsonrpc: '2.0', id: 1, method: 'SendMessage',
      params: {
        message: {
          kind: 'message', messageId: `ex06-probe-${Date.now()}`, role: 'user',
          parts: [{ kind: 'text', text: TASK }],
        },
      },
    };
    console.log(`>> POST ${base}/invoke  SendMessage  (task: ${TASK})`);
    const t0 = Date.now();
    let res;
    try {
      res = await fetchTimeout(base + '/invoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }, TURN_TIMEOUT_MS);
    } catch (e) {
      throw new Error(`SendMessage request failed (${e.name}: ${e.message}) — is the Ollama model turn hanging?\n${serve.tail()}`);
    }
    const ms = Date.now() - t0;
    const raw = await res.text();
    console.log(`>> response (${ms}ms): ${raw}`);
    const jr = JSON.parse(raw);

    // 5. Assert the task lifecycle + artifact text
    if (jr.error) throw new Error(`SendMessage returned a JSON-RPC error: ${JSON.stringify(jr.error)}`);
    const task = jr.result?.task;
    if (!task) throw new Error(`no result.task in response: ${raw.slice(0, 400)}`);
    if (task.status?.state !== 'TASK_STATE_COMPLETED') throw new Error(`task state is ${JSON.stringify(task.status?.state)}, expected TASK_STATE_COMPLETED`);
    let text = null;
    for (let i = (task.artifacts ?? []).length - 1; i >= 0 && text === null; i--) {
      const parts = (task.artifacts[i].parts ?? []).filter((p) => typeof p.text === 'string');
      if (parts.length) text = parts.map((p) => p.text).join(' ');
    }
    if (text === null) throw new Error(`completed task ${task.id} carries no text artifact; artifacts=${JSON.stringify(task.artifacts)}`);
    if (!text.includes(EXPECTED)) throw new Error(`artifact text "${text}" does not contain "${EXPECTED}"`);

    // 6. Prove cleanup
    const freed = await ensurePortFreed(port);
    console.log('PASS — A2A round trip');
    console.log(`  card:        name="${card.name}" version="${card.version}"`);
    console.log(`  discovery:   GET ${CARD_PATH} -> 200; interface ${JSON.stringify(rpc)}; capabilities=${JSON.stringify(card.capabilities)}`);
    console.log(`  round trip:  POST /invoke SendMessage (${ms}ms) -> state=TASK_STATE_COMPLETED`);
    console.log(`  artifact:    task.id=${task.id} text="${text}"`);
    console.log(`  cleanup:     serve tree killed, port ${freed ? 'freed' : 'NOT freed'}${freed ? '' : ` — check with: netstat -ano | Select-String ${port}`}`);
    if (!freed) throw new Error(`port ${port} still occupied after killing the serve tree`);
    return 0;
  } finally {
    await cleanup(serve, port);
  }
}

main()
  .then((rc) => process.exit(rc ?? 0))
  .catch((e) => {
    console.error(`\nFAIL: ${e.message}`);
    process.exit(1);
  });
