// probe-mcp.mjs — Ex05's one machine-verification command (zero dependencies).
//
// Proves the full agent-as-MCP-server round trip through the public protocol
// surface only (no internals, no SDK, no npm installs — Node 24 stdlib):
//
//   1. spawns `docker agent serve mcp agent.yaml` (stdio transport)
//   2. initialize        -> serverInfo must self-report "docker agent"
//   3. tools/list        -> exactly one tool, named after the agent (root),
//                           message-only input schema, response output schema
//   4. tools/call        -> the agent's model actually answers: result text
//                           must contain "pong" for the message
//                           "Reply with the single word: pong"
//   5. kills the whole serve process tree (Windows: docker-agent.exe child)
//
// Exit codes: 0 = all assertions passed; 1 = failed assertion; 2 = spawn /
// protocol error; 3 = timeout. Usage: `node .\probe-mcp.mjs` from this dir.

import { spawn, execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(HERE, 'agent.yaml');
const AGENT_NAME = 'root';          // agent name in agent.yaml == the exposed tool name
const TASK = 'Reply with the single word: pong';

// Data/session artifacts go to a throwaway temp dir via the global --data-dir
// flag (serve mcp itself has no --session-db, verified: `unknown flag`) so a
// verification run never writes into the repo or the user profile.
const tmp = mkdtempSync(path.join(tmpdir(), 'ex05-probe-'));


let child = null;
let killed = false;
let finished = false;

function killTree(reason) {
  if (killed || !child || child.exitCode !== null || child.signalCode) return;
  killed = true;
  const win = process.platform === 'win32';
  console.log(`[probe] stopping serve process (${reason || 'end of probe'})`);
  if (win) {
    // docker agent serve spawns a docker-agent.exe child; kill the tree, not
    // just the wrapper (cli-facts: the child is the one holding any resource).
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  } else {
    child.kill('SIGKILL');
  }
}

process.on('exit', () => {
  killTree('process exit');
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
});

// ---- tiny NDJSON JSON-RPC client over the child's stdio ----

let buf = '';
const pending = new Map();          // id -> resolve
const log = (...a) => console.log('[probe]', ...a);

child = spawn('docker', ['agent', 'serve', 'mcp', CONFIG, '--data-dir', tmp], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});


// If the server dies before we finish, late stdin writes would raise EPIPE;
// the exit handler below is the real signal, so swallow transport noise.
child.stdin.on('error', () => {});


child.stderr.on('data', d => log('SRV-STDERR:', JSON.stringify(d.toString().trim().slice(0, 300))));
child.on('error', e => finish(2, `spawn error: ${e.message}`));
child.on('exit', (code, sig) => {
  if (!killed && !finished) {
    finish(2, `serve process exited early (code=${code} signal=${sig}) before the round trip completed`);
  }
});

function request(id, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => {
      if (pending.delete(id)) {
        reject(Object.assign(
          new Error(`timeout after ${timeoutMs}ms waiting for reply to ${method} (id=${id})`),
          { code: 3 }));
      }
    }, timeoutMs);
    const line = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    log('SEND >>', line);
    child.stdin.write(line + '\n');
  });
}

function notify(method, params) {
  const line = JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
  log('SEND >>', line);
  child.stdin.write(line + '\n');
}

child.stdout.on('data', d => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).replace(/\r$/, '');
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch {
      log('RECV << (NON-JSON stdout):', JSON.stringify(line.slice(0, 300)));
      continue;
    }
    log('RECV <<', JSON.stringify(msg).slice(0, 1200));
    if (msg.id != null && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        rejectAll(2, `JSON-RPC error for id ${msg.id}: ${JSON.stringify(msg.error)}`);
      } else {
        resolve(msg.result);
      }
    }
  }
});

function rejectAll(code, message) {
  pending.clear();
  finish(code, message);
}


// ---- the assertions ----

const failures = [];
function assert(ok, what, detail) {
  if (ok) log(`PASS: ${what}`);
  else { failures.push(what); log(`FAIL: ${what} - ${detail ?? ''}`); }
}

function finish(code, msg) {
  if (finished) return;
  finished = true;
  killTree(msg ?? 'finish');
  if (msg && code !== 0) log(msg);
  if (code === 0) console.log('[probe] PASSED - full MCP round trip verified');
  else console.log(`[probe] FAILED (exit ${code}) - ${failures.length} failed assertion(s)`);
  process.exit(code);
}

initTimeouts();

function initTimeouts() {
  // Watchdog for the whole round trip.
  setTimeout(() => finish(3, `timeout: the round trip did not complete within the watchdog budget`), 420_000).unref?.();
}

log(`spawning: docker agent serve mcp ${CONFIG}`);

// 1. initialize
log('step 1: initialize');
let init;
try {
  init = await request(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'ex05-probe', version: '0.0.1' },
  }, 45_000);
} catch (e) {
  finish(e.code ?? 2, `initialize failed: ${e.message}`);
}
assert(init && init.serverInfo && init.serverInfo.name === 'docker agent',
  'initialize replies with serverInfo.name "docker agent"',
  `got ${JSON.stringify(init?.serverInfo ?? init)}`);
assert(!!init?.serverInfo?.version, 'initialize replies with a server version',
  `got ${JSON.stringify(init?.serverInfo?.version)}`);
assert(typeof init?.protocolVersion === 'string' && init.protocolVersion.length > 0,
  'initialize negotiates a protocolVersion', `got ${JSON.stringify(init?.protocolVersion)}`);
notify('notifications/initialized');

// 2. tools/list
log('step 2: tools/list');
let tools = [];
try {
  const res = await request(2, 'tools/list', {}, 20_000);
  tools = res?.tools ?? [];
} catch (e) {
  finish(e.code === 3 ? 3 : 2, `tools/list failed: ${e.message}`);
}
assert(Array.isArray(tools) && tools.length === 1,
  'tools/list exposes exactly one tool (one per agent)',
  `got ${JSON.stringify(tools?.map(t => t.name))}`);
const tool = tools[0] ?? {};
assert(tool.name === AGENT_NAME, `the tool is named after the agent ("${AGENT_NAME}")`,
  `got ${JSON.stringify(tool.name)}`);
assert(/Ex05/i.test(String(tool.description ?? '')),
  'the tool description is the agent description from agent.yaml',
  `got ${JSON.stringify(tool.description)}`);
assert(tool.inputSchema?.properties?.message && (tool.inputSchema.required ?? []).includes('message'),
  'inputSchema takes a single required message string',
  `got ${JSON.stringify(tool.inputSchema)}`);
assert(tool.outputSchema?.properties?.response && (tool.outputSchema.required ?? []).includes('response'),
  'outputSchema promises a response string',
  `got ${JSON.stringify(tool.outputSchema)}`);

// 3. tools/call — the model round trip
log('step 3: tools/call');
let call;
try {
  call = await request(3, 'tools/call',
    { name: AGENT_NAME, arguments: { message: TASK } }, 300_000);
} catch (e) {
  finish(e.code === 3 ? 3 : 2, `tools/call failed: ${e.message}`);
}
const structured = call?.structuredContent?.response;
const contentText = (call?.content ?? [])
  .map(c => (typeof c?.text === 'string' ? c.text : ''))
  .filter(Boolean).join(' ');
const observed = String(structured ?? contentText);
log(`observed result text: ${JSON.stringify(observed.slice(0, 400))}`);
assert(call?.isError !== true, 'tools/call completes without protocol error',
  `isError=${JSON.stringify(call?.isError)}`);
assert(observed.trim().length > 0, 'tools/call returns a non-empty observable result');
assert(/pong/i.test(observed), 'the agent answers the task with "pong"',
  `observed: ${JSON.stringify(observed.slice(0, 200))}`);

finish(failures.length === 0 ? 0 : 1);

// If only unawaited timers remain this never matters: every path above ends in
// finish() -> process.exit. This keep-alive only guards a stray open handle
// (the spawned child's pipes) from making Node hang before process.exit runs.
setInterval(() => {}, 60_000);

