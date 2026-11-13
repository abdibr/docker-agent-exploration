# Ex06 — the same agent, exposed over A2A

The Ex01 agent shape again (named `gemma4_local` entry, no toolsets — its *capability*
surface is deliberately boring), but the *reachability* story is the whole example:
`docker agent serve a2a` turns the config into a discoverable A2A v1.0 participant — an
agent card at `GET /.well-known/agent-card.json`, and a JSON-RPC task interface at
`/invoke` where one `SendMessage` round-trips into a completed task with artifact text.
This is the agent-to-agent flavor of the "serve" family (Ex05 was the MCP-server flavor).

## Prerequisite

The **Ollama daemon must be running** (`ollama serve` or the desktop app) — the built-in
`ollama` provider talks to `localhost:11434` with no API key. Verify with `ollama list`:
you should see `gemma4:latest`. For the optional cloud swap the Ollama app must also be
**signed in**. Docker Desktop must be running for `docker agent serve a2a` itself. Node 24
is needed only for the zero-dependency probe script — no npm installs anywhere.

## What it teaches

- **Agent-card discovery.** Serving over A2A makes the agent self-describing:
  `GET /.well-known/agent-card.json` returns an A2A v1.0 card (observed live, verbatim):

  ```json
  {"supportedInterfaces":[{"url":"http://127.0.0.1:8383/invoke","protocolBinding":"JSONRPC","protocolVersion":"1.0"}],"capabilities":{"pushNotifications":false,"streaming":true},"defaultInputModes":[],"defaultOutputModes":[],"description":"Ex06 agent over A2A - agent card discovery plus one SendMessage task round trip","name":"agent","skills":[{"description":"Ex06 agent over A2A - agent card discovery plus one SendMessage task round trip","id":"agent_","name":"","tags":["llm","docker agent"]}],"version":"v1.153.0"}
  ```

  The card names the interface to call (`{"url":"…/invoke","protocolBinding":"JSONRPC","protocolVersion":"1.0"}`),
  advertises `capabilities.streaming:true` (unexercised here — streaming is
  `SendStreamingMessage` + SSE, a separate surface), and auto-generates `skills[0]` with
  tags `["llm","docker agent"]`. The card `version` is the serving **CLI version**
  (v1.153.0), not a config field.
- **The task lifecycle, not a request/response.** One `SendMessage` returns a whole
  **task object**: `status.state` progresses to `TASK_STATE_COMPLETED`, `history[]` echoes
  the user message, `artifacts[]` carry the answer, `contextId` ties the conversation, and
  `metadata` shows cagent wraps the session in google's **ADK** extension
  (`adk_app_name:"agent"` — the config filename). An answer to *forward*, not just text to
  *display*.
- **CamelCase method surface.** This build embeds `a2aproject/a2a-go/v2` (A2A v1.0):
  `SendMessage`, `SendStreamingMessage`, `GetTask`, `ListTasks`, `CancelTask`,
  `SubscribeToTask`, `GetExtendedAgentCard`, plus push-notification CRUD. The v0.2-style
  `message/send` is **rejected** (see Gotchas) — only CamelCase names exist (`Send`-ing a
  message IS `SendMessage`).
- **A zero-dependency headless verifier.** `probe-a2a.mjs` (plain Node 24, no packages)
  spawns the serve process, polls the card, fires one `SendMessage`, asserts the task
  state and artifact text, kills the serve tree, and proves the port is freed.

## MCP vs A2A — the Ex05 contrast (when to reach for each)

Ex05 served the same kind of agent over MCP; the difference is *who* is asking, and the
shape of the conversation:

| | **Ex05 — `serve mcp`** (agent as tool) | **Ex06 — `serve a2a`** (agent as peer) |
|---|---|---|
| Who consumes it | MCP **clients** embedding the agent in a toolbox (Claude Code health-checked live in Ex05) | **Other agents** over HTTP, via discovery cards |
| Discovery | `tools/list`: exactly one tool **named after the agent**, `inputSchema {message}` / `outputSchema {response}` | **Agent card** at `/.well-known/agent-card.json`: name, description, skills, version, capabilities, interface URLs |
| Call shape | One `tools/call` → one text `response` | `SendMessage` → a **task**: state machine (`TASK_STATE_COMPLETED`), `history`, `artifacts`, `contextId` — designed for ongoing inter-agent work |
| Method names | MCP snake_case (`tools/call`, `tools/list`) | **A2A v1.0 CamelCase** (`SendMessage`); v0.2 `message/send` → 32601 |
| Transport | stdio NDJSON by default; `--http` for stateless streamable HTTP | HTTP JSON-RPC, POSTs at **path-agnostic** endpoints (`/invoke` is the card-advertised name) |
| State | Stateless per MCP `2026-07-28` HTTP semantics | Task/context IDs + history — a server-side lifecycle |

Docker's docs put it in one sentence: **ACP** connects an agent to a *host application*
(IDE, CLI) via stdio; **A2A** connects *agents to other agents* over HTTP; **MCP** exposes
agents as *tools* for other MCP clients. Reach for `serve mcp` when you want your agent to
be *called as a tool* from an MCP client; reach for `serve a2a` when you want agents to
*discover each other, hand off tasks, and follow task state* over HTTP.

## Run it (serve — owner demo)

```powershell
cd ex06-a2a
docker agent serve a2a .\agent.yaml --listen 127.0.0.1:8383     # default port is 8082; pick a free one with -l/--listen
# Listening on 127.0.0.1:8383
# Tool safety policy: restricted (source: serve default)
```

Then point any HTTP client at it: fetch the card, `POST /invoke` a `SendMessage`
(the probe's payload below is the template). Other client options observed or documented:

- The built-in **`a2a` consumer toolset** (`type: a2a` + `url:` in an agent's `toolsets:`)
  lets one docker agent call another served over A2A — the two halves of next-step
  agentic orchestration on this CLI (shape UNVERIFIED-DEDUCED; not exercised here).
- SDKs speaking this card + method set natively: Python `a2a-sdk`, Go
  `github.com/a2aproject/a2a-go/v2` (package names UNVERIFIED-DEDUCED; not installed here).

## The verification template (headless — machine-verified)

This is the example's **one** machine-verification command (the A2A analogue of Ex01's
`--exec` template — external behavior only, at the protocol seam). From this directory:

```powershell
node .\probe-a2a.mjs
```

What it asserts, in order — exit 0 only if every step passes:

1. **Pre-flight:** `agent.yaml` exists; Ollama daemon reachable (the README prerequisite).
2. **Serves:** spawns `docker agent serve a2a .\agent.yaml --listen 127.0.0.1:<free-port>`
   (prefers 8383, falls back to an ephemeral free port).
3. **Discovery:** polls `GET /.well-known/agent-card.json` until 200 (≤60 s), asserts the
   card shape — non-empty `name`, `version`, a `supportedInterfaces` entry with
   `protocolBinding:"JSONRPC"` and a `url` containing `/invoke` — and records them.
4. **Round trip:** POSTs **one** `SendMessage` JSON-RPC request to `/invoke`:

   ```json
   {"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{"kind":"message","messageId":"ex06-probe-1794578923899","role":"user","parts":[{"kind":"text","text":"Reply with exactly: A2A OK"}]}}}
   ```

5. **Task lifecycle + artifact:** asserts the response's `result.task.status.state` is
   `TASK_STATE_COMPLETED`, reads the **last** artifact with text parts, and asserts it
   contains `A2A OK`. Observed verbatim response (2026-11-13, `docker agent` v1.153.0;
   first run of the day took 331 ms, a rerun 496 ms):

   ```json
   {"jsonrpc":"2.0","id":1,"result":{"task":{"id":"01a1d53d-4182-760e-997d-b1e3970f921e","artifacts":[{"artifactId":"01a1d53d-42a5-7144-9c82-704ce64d227a","metadata":{"adk_partial":true},"parts":[{"data":{},"metadata":{"adk_partial":true}}]},{"artifactId":"01a1d53d-42c8-7e9f-936e-0a32db506d2e","parts":[{"text":"A2A OK"}]}],"contextId":"01a1d53d-4182-760f-8c22-0d63287da1eb","history":[{"messageId":"ex06-probe-1794578923899","parts":[{"text":"Reply with exactly: A2A OK"}],"role":"user"}],"metadata":{"adk_app_name":"agent","adk_session_id":"01a1d53d-4182-760f-8c22-0d63287da1eb","adk_user_id":"A2A_USER_01a1d53d-4182-760f-8c22-0d63287da1eb","https://google.github.io/adk-docs/a2a/a2a-extension/":true},"status":{"state":"TASK_STATE_COMPLETED","timestamp":"2026-11-13T06:08:44.2329583-08:00"}}}
   ```

6. **Cleanup:** kills the whole serve process tree (`taskkill /T`), then *proves* the
   port is freed by re-binding it — failing the run if the listener survived (the Windows
   child-process gotcha below, turned into an assertion).

**Tool approvals:** the serve banner declares `Tool safety policy: restricted (source:
serve default)`. That is fine here *because* the agent has **no toolsets** — every A2A
turn is a pure model turn, so nothing ever awaits approval. If you extend this config
with toolsets and serve it, tasks that must write or run commands need `--safety
autonomous` on the serve command (or per-request approval) — the same trade-off Ex01/
Ex02 document for `run`.

> **For CI, the probe IS the assertion layer** — it never trusts the serve process's exit
> code and never parses transcript text; it asserts the protocol surface itself (card
> fields, task state, artifact text, port freed). All five serve surfaces, in the
> cross-cutting guide: [`docs/notes/run-modes.md`](../docs/notes/run-modes.md#15-serving-an-agent-api-chat-mcp-a2a-acp).

## Local ↔ cloud swap (one line)

Identical to every example in the repo — swap one line in the named models entry:

```yaml
models:
  gemma4_local:
    provider: ollama
    model: gemma4:latest          # ← swap to: glm-5.3-flash:cloud (same daemon proxies to Ollama Cloud)
```

The A2A surface is model-agnostic — the card and the task contract do not change (the
card `version` tracks the CLI, not the model).

## Gotchas

- **Method casing:** `message/send` (the v0.2 name), `message:send`, `send_message`,
  `invoke` — all rejected with `-32601 method not found` (observed live in the exploration
  notes and re-verified on v1.153.0):

  ```json
  {"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method not found","data":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","domain":"a2a-protocol.org","metadata":{"timestamp":"2026-11-13T14:09:08Z"},"reason":"METHOD_NOT_FOUND"}]}}
  ```

  This surface speaks **A2A v1.0 with CamelCase methods** — `SendMessage`, not
  `message/send`.
- **Legacy discovery path is dead:** `GET /.well-known/agent.json` → **404** (re-verified
  live on v1.153.0). A2A v1.0 renamed discovery to `agent-card.json` — old-bookmark
  clients break silently, and a tooling layer pointed at the old path looks "deployed"
  while discovering nothing.
- **The card `name` is the config file's stem, not the agent name.** The observed card
  says `"name":"agent"` although the agent block is named `root`; the exploration notes
  recorded the same with a `serve-probe-agent.yaml` (card name `serve-probe-agent`,
  agent named `probe`). `-a/--agent` does not change the card name. If a peer implements
  against the card name, it gets the filename's identity.
- **Windows child-process kill:** the LISTENER is the `docker-agent.exe` child of the
  `docker`/`cmd` wrapper — killing only the wrapper leaves the port squatted. The probe
  kills the tree (`taskkill /T /F`), falls back to the port owner from `netstat -ano`,
  and asserts the port re-binds before exiting 0.
- **Read the LAST artifact's text parts.** A cosmetic first artifact (`adk_partial:true`,
  empty `data:{}`) precedes the real answer — consuming code that grabs `artifacts[0]`
  gets nothing; take the last artifact that has `parts[].text`.
- **Port choice:** `serve a2a` defaults to `127.0.0.1:8082`; the probe passes
  `--listen 127.0.0.1:<free-port>` explicitly (prefers 8383, falls back to an ephemeral
  free port), so reruns and parallel serves never collide and never squat the default.
- **ADK metadata:** task responses carry cagent's google-ADK extension metadata
  (`adk_app_name:"agent"` = the config filename again, `adk_session_id`, `adk_user_id`
  derived from `contextId`). Harmless, but strict downstream response validators should
  expect it.
- **Version note:** the exploration notes verified this surface on v1.145.0; this example
  is verified on **v1.153.0** (both probe runs and the gotcha re-checks). Between the two
  the card gained `capabilities.pushNotifications:false` — script against field
  *presence and meaning*, not an exact card snapshot.

**Observed when verified (2026-11-13, `docker agent` v1.153.0):** `node .\probe-a2a.mjs`
exit 0 twice (round trips 331 ms / 496 ms); card → 200 A2A v1.0 with the JSONRPC
`/invoke` interface; `SendMessage` → `TASK_STATE_COMPLETED` with artifact text exactly
`"A2A OK"`; `message/send` → 32601; `agent.json` → 404; serve banner
`Tool safety policy: restricted (source: serve default)`; port verified freed after every
run.
