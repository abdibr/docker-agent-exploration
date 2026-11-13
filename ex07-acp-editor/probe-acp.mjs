#!/usr/bin/env node
// probe-acp.mjs — Ex07's one machine-verification command. Zero dependencies
// (Node 24 standard library only, no npm installs) — the ACP counterpart of a
// headless `docker agent run --exec` verification.
//
// Spawns `docker agent serve acp agent.yaml` over stdio exactly the way an ACP
// host (an editor) would, drives the ACP v1 handshake:
//
//   initialize (protocolVersion 1) -> session/new -> session/prompt
//     -> streamed session/update notifications (agent_message_chunk ...)
//     -> response { stopReason: "end_turn" }
//
// and asserts, as an outside observer:
//   1. the negotiated protocolVersion is 1
//   2. a real sessionId came back from session/new
//   3. the model's reply text arrived via agent_message_chunk updates (non-empty)
//   4. session/prompt answered with stopReason "end_turn"
//
// Exits 0 on success, 1 on any failed assertion or timeout, killing the server
// process tree in both cases (on Windows the listener is a docker-agent.exe
// child of the `docker` wrapper — taskkill /T /F, not just child.kill()).
//
// Usage: node probe-acp.mjs [config-path]
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = process.argv[2] || join(HERE, 'agent.yaml');
const PROMPT = 'Reply with the single word: pong'; // no embedded double quotes (PS 5.1 lesson)

const HANDSHAKE_MS = 60_000; // per handshake step
const PROMPT_MS = 300_000;   // gemma4 streams ~1 min of thought before answering

const log = (...a) => console.log('[probe-acp]', ...a);

const child = spawn('docker', ['agent', 'serve', 'acp', CONFIG], { stdio: ['pipe', 'pipe', 'pipe'] });
let alive = true;
const killTree = () => {
  if (!alive) return;
  alive = false;
  if (child.pid) {
    const r = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    if (r.status !== 0) { try { child.kill('SIGKILL'); } catch {} }
  } else { try { child.kill('SIGKILL'); } catch {} }
};

let phase = 'initialize';
let sessionId = null;
let messageText = '';
let messageChunks = 0;
let thoughtChunks = 0;
let stopReason = null;
let answeredId1 = false;
let deadline = null;

const armDeadline = (ms, label) => {
  clearTimeout(deadline);
  deadline = setTimeout(() => {
    log(`TIMEOUT after ${ms}ms waiting for ${label}`);
    log(`  evidence so far: sessionId=${sessionId}, reply='${messageText.trim()}', stopReason=${stopReason}`);
    finish(1);
  }, ms);
};

const send = (obj) => {
  const s = JSON.stringify(obj);
  log('CLI >>', s);
  child.stdin.write(s + '\n');
};

const contentText = (content) => {
  const blocks = Array.isArray(content) ? content : [content];
  return blocks.map((b) => (b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string' ? b.text : '')).join('');
};

const fail = (why) => { throw new Error(why); };
const finish = (code) => {
  phase = 'done';
  clearTimeout(deadline);
  killTree();
  process.exit(code);
};

child.stdout.on('data', (d) => {
  let buf = d.toString();
  let idx;
  try {
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { log('SRV << (non-JSON stdout):', line.slice(0, 200)); continue; }
      log('SRV <<', JSON.stringify(obj).slice(0, 220) + (JSON.stringify(obj).length > 220 ? ' …' : ''));

      if (obj.method === 'session/update') {
        // v1.153.0 wrapper: { sessionId, update: { sessionUpdate, content, ... } } —
        // v1.145.0 flat shape: { sessionUpdate, content, ... } directly on params.
        const u = obj.params && obj.params.update;
        const flat = !u;
        const kind = (flat ? obj.params.sessionUpdate : u.sessionUpdate);
        const content = flat ? obj.params.content : u.content;
        if (kind === 'agent_message_chunk') { messageText += contentText(content); messageChunks++; }
        else if (kind === 'agent_thought_chunk') { thoughtChunks++; }
        continue;
      }
      if (obj.error !== undefined && typeof obj.id === 'number') {
        fail(`JSON-RPC error for id ${obj.id} in phase ${phase}: ${JSON.stringify(obj.error).slice(0, 300)}`);
      }

      if (obj.id === 1 && !answeredId1) {
        answeredId1 = true;
        const pv = obj.result && obj.result.protocolVersion;
        if (pv !== 1) fail(`initialize negotiated protocolVersion ${pv}, expected 1 (ACP v1)`);
        log(`AGREE: protocolVersion=${pv}, agentInfo=${JSON.stringify(obj.result.agentInfo)}`);
        phase = 'session/new';
        armDeadline(HANDSHAKE_MS, 'session/new');
        send({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: HERE, mcpServers: [] } });
      } else if (obj.id === 2) {
        sessionId = obj.result && obj.result.sessionId;
        if (!sessionId) fail(`session/new returned no sessionId: ${JSON.stringify(obj.result).slice(0, 200)}`);
        log(`SESSION: sessionId=${sessionId}`);
        phase = 'session/prompt';
        armDeadline(PROMPT_MS, 'session/prompt completion');
        send({ jsonrpc: '2.0', id: 3, method: 'session/prompt', params: { sessionId, prompt: [{ type: 'text', text: PROMPT }] } });
      } else if (obj.id === 3) {
        stopReason = obj.result && obj.result.stopReason;
        log(`PROMPT RESOLVED: messageChunks=${messageChunks}, thoughtChunks=${thoughtChunks}, stopReason=${stopReason}`);
        const missing = [];
        if (messageChunks === 0 || messageText.trim() === '') missing.push('no agent_message_chunk text arrived (no reply through the stream)');
        if (stopReason !== 'end_turn') missing.push(`stopReason is ${JSON.stringify(stopReason)}, expected "end_turn"`);
        if (missing.length) fail(missing.join('; '));
        log(`REPLY: ${messageText.trim()}`);
        log('PASS: ACP v1 handshake + streamed reply + end_turn — all assertions green');
        finish(0);
      }
    }
  } catch (e) { log('FAIL:', e && e.message ? e.message : String(e)); finish(1); throw e; }
});

child.stderr.on('data', (d) => log('SRV-STDERR:', d.toString().trim().slice(0, 220)));
child.on('error', (e) => { log('SPAWN-ERROR:', e.message); finish(1); });
child.on('exit', (code) => { alive = false; if (phase !== 'done') { log(`server exited early (code ${code}) in phase ${phase}`); finish(1); } });

log(`spawning: docker agent serve acp ${CONFIG}`);
phase = 'initialize';
armDeadline(HANDSHAKE_MS, 'initialize');
send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
  },
});

process.on('exit', () => { try { if (alive) killTree(); } catch {} });

