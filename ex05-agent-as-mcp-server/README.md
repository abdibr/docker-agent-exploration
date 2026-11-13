# Ex05 — the agent itself exposed as an MCP server

The direction flips. In Ex02 and Ex03 the agent was the MCP **client**: it reached out
through toolsets to a catalog search server and a containerized server you built. Here
the very same declarative agent config is served as an MCP **server** — `docker agent
serve mcp` puts your agent on the wire so that any standard MCP client (Claude Code, the
Inspector, VS Code, any SDK) can call the agent itself as a tool. Agent-as-tool
integration in one line of CLI; the YAML config is still the whole program.

## Prerequisite

The **Ollama daemon must be running** (`ollama serve` or the desktop app) for any run of
this example — the built-in `ollama` provider talks to the OpenAI-compatible `/v1`
endpoint at `localhost:11434` with no API key. Verify with `ollama list`: you should see
`gemma4:latest` (and `glm-5.3-flash:cloud` for the optional cloud swap). The MCP side
needs nothing installed: the `serve mcp` process speaks the protocol itself, and the
verification client below is a single zero-dependency Node script (`node --version` →
v24.12.0; no npm installs anywhere in this example).

## What it teaches

- **Agent-as-MCP-server vs agent-using-MCP-tools.** Ex02/Ex03 declared toolsets *on* an
  agent (`type: mcp` with a catalog `ref:` or a containerized command); every MCP
  participant was a Docker component. Ex05 keeps the YAML and swaps sides: the server is
  the agent config, the client is someone else's. Ex02/Ex03 taught your agent to call
  tools; this example teaches every MCP client to call *your agent*.
- **One tool per agent, named after the agent.** With this single-agent config,
  `tools/list` returns exactly one tool: `name: root` — the agent's name in agent.yaml
  (`--tool-name` overrides it, only when exposing a single agent; a multi-agent config
  like Ex04's team would surface every agent as its own tool). Input schema is a single
  required `{message: string}`; output schema promises `{response: string}`. The tool's
  `description` is the agent's `description:` from agent.yaml — the calling model reads
  it to decide when to invoke your agent, so write it like a tool description.
- **Annotations are generic, not semantic**: the observed tool carries `readOnlyHint:
  true` even though a call runs a full LLM chat — do not read "no side effects" into
  them; an agent with write toolsets would still act.
- **The HTTP variant is stateless per MCP `2026-07-28`** (`serve mcp --http`, default
  listen `127.0.0.1:8081`): POST-only at path-agnostic endpoints (`/` and `/mcp` both
  answer), SSE-wrapped responses, notifications acknowledged with a bare `202`, **no
  `Mcp-Session-Id`** issued, `GET`/`DELETE` → 405. Legacy `initialize` clients keep
  working with per-request state. `--auth-token` is required for non-loopback binds
  unless `--insecure-no-auth`. (Explored with a dedicated HTTP probe; this example's
  verified path is stdio.)
- Every run surface around this one (five `serve` modes, ports, safety defaults) is
  cataloged in [`docs/notes/run-modes.md`](../docs/notes/run-modes.md) §15.

## Run it (owner demo — a serve surface, not a TUI)

`serve mcp` has no dashboard: it is a protocol peer that sits waiting for a client. The
closest thing to a "TUI" is starting it and connecting an interactive MCP client:

```powershell
cd ex05-agent-as-mcp-server
docker agent serve mcp .\agent.yaml
# serve process starts; NDJSON MCP traffic flows on stdin/stdout
```

An interactive client connects over that stdio transport. **Claude Code** was verified
live on this machine for exactly this surface (`claude mcp add` + `claude mcp list` →
`✓ Connected`; `claude --version` → 2.1.101):

```powershell
claude mcp add ex05-agent -- docker agent serve mcp D:\agents_proj\docker_agents\ex05-agent-as-mcp-server\agent.yaml
claude mcp list          # -> ex05-agent: docker agent serve mcp ... - ✓ Connected
claude mcp remove ex05-agent
```

Omitting `--agent` exposes **every** agent in the config as its own tool (verified in
this example's round trip: a single-agent config lists exactly one tool named `root`);
append `--agent root` to pin exactly one agent explicitly. You can then chat with Claude
Code and watch it invoke your agent as a tool — but treat that as an owner demo: it
consumes Claude Code's own model and account, which is **not** this example's
verification path (below needs nothing but Node and your local Ollama). Config entries
are scoped to the directory where you ran `claude mcp add`. Other client routes, for the
record: MCP Inspector (`npx @modelcontextprotocol/inspector docker agent serve mcp
.\agent.yaml`) and VS Code's `.vscode/mcp.json` stdio server entry — both standard
client shapes (not exercised on this machine).

## The verification template (headless — machine-verified)

The example's **one** machine-verification command, from this directory:

```powershell
node .\probe-mcp.mjs
```

`probe-mcp.mjs` (zero dependencies, Node stdlib only) spawns `docker agent serve mcp
agent.yaml` itself, performs the MCP handshake and round trip over the protocol surface,
kills the serve process tree, and exits 0 only if every assertion held (1 = failed
assertion, 2 = spawn/protocol error, 3 = timeout). It asserts, in order:

1. `initialize` → the server self-reports `serverInfo.name == "docker agent"` with a
   version, and negotiates a `protocolVersion` (observed: `2025-06-18`).
2. `tools/list` → exactly one tool, named after the agent (`root`), its description
   equal to the agent's `description:` from agent.yaml, input schema
   `{message}` required, output schema `{response}` required.
3. `tools/call` with `{"message": "Reply with the single word: pong"}` → the *inner
   agent's model* must actually answer: the observable result contains "pong".
4. The whole serve process tree is stopped (`taskkill /T /F` on Windows) — nothing is
   left running or listening.

**Observed when verified (2026-11-13, `docker agent` v1.153.0):** exit 0; `initialize`
replied `serverInfo {"name":"docker agent","version":"v1.153.0"}` / protocolVersion
`2025-06-18`; `tools/list` returned the single `root` tool with the description from
agent.yaml; `tools/call` completed with `structuredContent: {"response":"pong"}` —
~20 s end to end on the local model (first-ever call may add model load time).

**Tool approvals under serve:** the serve process defaults to the `restricted`
tool-safety profile (observed banner during exploration) — but this agent declares **no
toolsets**, so the round trip never faces an approval decision at all. If you add
toolsets to a served agent, expect the same fail-closed behavior Ex02 documented
(restricted denies unattended calls). Note `--safety` / `--auth-token` are only valid
with `--http`; stdio serve accepts neither.

## Local ↔ cloud swap (one line)

Identical to every example — one line in the named models entry:

```yaml
models:
  gemma4_local:
    provider: ollama
    model: gemma4:latest          # ← swap to: glm-5.3-flash:cloud (same daemon proxies to Ollama Cloud)
```

Nothing about the MCP surface changes: whichever model the entry names is what answers
every `tools/call` from every client. (The cloud path needs the Ollama app signed in;
the local committed config needs nothing.)

## Gotchas

- **Windows cleanup must kill the process tree, not the wrapper.** `docker agent serve
  <mode>` spawns a separate `docker-agent.exe` child — in HTTP mode that child is the
  one holding the listener. Killing the `docker` wrapper alone can orphan it. The probe
  uses `taskkill /pid <pid> /T /F`; stdio holds no port, but `--http` defaults to
  `127.0.0.1:8081` — if a stale tree survives, kill the port owner or no other process
  can bind.
- **stdout carries only NDJSON**; all serve logging goes to stderr. That split is what
  makes the standard SDK's stdio client transport work untouched — a hand-rolled client
  must parse stdout line-by-line as JSON-RPC and tolerate interleaved notification
  lines that need no reply.
- **`structuredContent` vs `content` — the answer travels twice** (observed): text
  content came back as the JSON string `"{\"response\":\"pong\"}"` while
  `structuredContent.response` was the typed `pong`. Prefer the typed field when your
  client supports structured output; fall back to text otherwise.
- **The plugin version moved under our feet.** Docker Desktop auto-updated `docker
  agent` mid-exploration (v1.145.0 → v1.153.0). One observable protocol change:
  v1.153.0's `initialize` no longer advertises the `logging:{}` capability (only
  `tools:{listChanged:true}`) — verify against `serverInfo`, not against assumed
  capabilities; that is why the probe does not assert on them.
- **`serve mcp` does not accept `--session-db`** (observed: `unknown flag` — that flag
  belongs to other serve modes; caught by this probe's failing first draft). Pin the
  *global* `--data-dir <dir>` flag instead (default `~/.cagent`) — the probe pins a
  throwaway temp dir and deletes it, so verification writes nothing into your profile.
- **HTTP variant is stateless — don't wait for a session cookie.** No
  `Mcp-Session-Id` is issued (see the `2026-07-28` facts above). Clients speaking older
  protocol revisions keep working: the legacy `initialize` handshake is accepted with
  per-request state (documented behavior; the exploration HTTP probe used exactly that
  legacy path).
- Client registrations spawn `serve` from *their* working directory, not yours — pass an
  absolute config path (as the `claude mcp add` snippet above does), and remember
  `agent.yaml` alone is never auto-discovered anyway (only `docker-agent.{yaml,yml,hcl}`
  would be, per the run-modes note).

