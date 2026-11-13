# Ex07 — ACP editor integration: the agent in your editor

The interop finale. The same declarative YAML as every other example, served over
**ACP — the Agent Client Protocol** (`docker agent serve acp`): an ACP host (an editor
such as Zed) spawns the agent as a subprocess and drives it over JSON-RPC 2.0,
newline-delimited, with a session lifecycle and streamed updates. Docker Agent speaks
**ACP v1** (the stable line at agentclientprotocol.com; v2 exists only as Draft) — not to
be confused with IBM's Agent Communication Protocol.

## Prerequisite

The **Ollama daemon must be running** (`ollama serve` or the desktop app; `ollama list`
must show `gemma4:latest`) — the built-in `ollama` provider talks to `localhost:11434`
with no API key, exactly like every other example here. Plus **Node 24** for the
verification probe: it is a zero-dependency standard-library script (no `npm install`
anywhere in this example — the probe is a single file you can read end to end).

For an **in-editor session** you additionally need an *ACP host* — see the next two
sections. No editor beyond what is already on this machine was needed for the
machine-verified part.

## What it teaches

- **`serve acp` is the fifth `serve` surface** and the only one with no `--listen` /
  `--http` flags: it is **stdio-only** and meant to be *launched by an editor as a
  subprocess* — the exact shape every other editor integration (LSP, DAP) already uses.
  Wire: JSON-RPC 2.0 NDJSON on stdin/stdout; diagnostic logs on stderr.
- **The ACP v1 handshake**, machine-verified on the wire: `initialize` (negotiates
  `protocolVersion: 1`; returns `agentCapabilities` and `authMethods: ["host-credentials"]`
  — no interactive auth needed because the config names its `ollama` model provider),
  then `session/new` (returns a `sessionId` plus cagent `configOptions`: the editor can
  switch **tool-safety mode** and the **per-agent model** from inside its UI, exposed
  again as `modes.availableModes`), then `session/prompt`, streamed `session/update`
  notifications, and a `{stopReason: "end_turn"}` response.
- **The config stays declarative and unchanged in shape** — the protocol surface is one
  launch verb away from `docker agent run`. No toolsets are attached here on purpose:
  an ACP host brings editor capabilities with it (file reads/writes and terminal access
  arrive through the client's `clientCapabilities` and `session/request_permission`
  permission prompts, not agent-side toolsets).
- **The editor is the client.** Every other example in this repo keeps the agent on the
  consuming or consumed side of a machine protocol; ACP is the one flavor where the
  *human's tool* (the editor) is the peer.

## Connect an editor (owner demo — steps)

An honest split first: the headless probe in the next section **machine-verifies the
protocol surface**; driving an editor's UI cannot be verified from a script, so the
in-editor part is an owner hands-on demo — the same status the TUI runs carry in
Ex01/Ex02. On this machine as verified, no ACP host was installed, so nothing below an
`UNVERIFIED-ON-THIS-MACHINE` marker has been executed here.

**Zed — the reference ACP host (spec author; NOT installed on this machine — all Zed
steps UNVERIFIED-ON-THIS-MACHINE).** Install from [zed.dev/download](https://zed.dev/download),
then wire the agent server. Zed → Agent Settings → External Agents → *Add Custom Agent*
(opens `settings.json`), or paste directly:

```json
{
  "agent_servers": {
    "docker-agent": {
      "type": "custom",
      "command": "docker",
      "args": ["agent", "serve", "acp", "D:/agents_proj/docker_agents/ex07-acp-editor/agent.yaml"],
      "env": {}
    }
  }
}
```

Then pick `docker-agent` in the Agent Panel's new-thread menu, and open an ACP log if
the wire misbehaves (`dev: open acp logs`). The `agent_servers` custom-agent shape above
is quoted verbatim from Zed's external-agents documentation as captured in the
exploration notes; [`docs/notes/run-modes.md`](../docs/notes/run-modes.md) §15 lists
`serve acp` among the five serve surfaces. Note what ACP buys the editor: it only has to
spawn one command — no plugin install, no marketplace.

**VS Code 1.143.1 (installed here).** VS Code itself does not speak ACP; hosting needs a
third-party ACP-host extension. A bounded check of the ACP documentation's Clients page
([agentclientprotocol.com/overview/clients](https://agentclientprotocol.com/overview/clients),
2026-11-13) lists several real ones for VS Code: an **ACP Client extension**, **ACP
Patchbay**, **ACP Pro** (also packaged for Cursor/Windsurf/Trae-compatible IDEs), and
**Exo for VSCode**. *None is installed or attempted on this machine* — VS Code connection
steps stay the generalize-to-other-setups part of this example, not a verified path.

**Claude Code 2.1.101 (installed here) is not an ACP host.** It is an *MCP client* — its
bridge to the docker agent is Ex05's `docker agent serve mcp` (already verified live in
that example). The `@zed-industries/claude-code-acp` adapter found in the notes bridges
Claude Code *itself* as an ACP agent to editors; it does not bridge docker-agent.

## ACP vs the other flavors — when to reach for which

| Example | Flavor | Who talks to whom | Wire shape | Proven by |
|---|---|---|---|---|
| Ex02/Ex03 | **MCP** (agent = client) | agent → *tools* | tool-listing + tool-call, containerized | results shaped the answer |
| Ex05 | **MCP** (agent = server) | *MCP client* → agent | one tool named after the agent | standard client `✓ Connected` |
| Ex06 | **A2A** | *agent* → agent | HTTP, agent card, task lifecycle | full task round trip |
| Ex04 | **sub_agents** | lead → sub-agents | no protocol at all (in-config delegation) | `transfer_task` visible in transcript |
| Ex07 (this) | **ACP** | *editor* (client) → agent | stdio JSON-RPC sessions + streamed updates | probe handshake below |

The mental model: **MCP wires tools into an agent** (or the agent out as one tool);
**A2A delegates work between agents** across a network; **sub_agents is multi-step work
inside one config**; **ACP is the editor-facing seat at the same table** — it exists
because editors need more than one-shot tool calls: a session that persists, streamed
partial answers, thought-vs-message rendering, tool-approval prompts, and diff-oriented
file editing. Reach for ACP when the human sits in an editor; the headless probe below
is the same surface with the editor replaced by a script.

## The verification template (headless — machine-verified)

From this directory:

```powershell
node .\probe-acp.mjs
```

One command, zero dependencies (Node 24 stdlib only). The probe spawns
`docker agent serve acp .\agent.yaml` exactly the way an editor would — as a piped-stdio
subprocess — and drives the full ACP handshake, asserting **external behavior only**:

1. `initialize` with `protocolVersion: 1` → the server response negotiates
   **`protocolVersion: 1`** (ACP v1, not a string `"1"` — it is the number),
2. `session/new` → a real **`sessionId`** (UUID) comes back,
3. one short `session/prompt` ("Reply with the single word: pong") → the reply text
   arrives through streamed **`session/update` / `agent_message_chunk`** notifications
   (non-empty; thought chunks are counted, not treated as the answer),
4. the prompt resolves with **`stopReason: "end_turn"`**.

Then it kills the whole process tree (`taskkill /T /F` — see gotchas) and exits **0 on
success, 1 on any failed assertion or timeout** (handshake steps 60 s, prompt 300 s —
local models can stream ~1 min of thought before answering). Unlike the `--exec`
verification template of Ex01/Ex02, this exit code is trustworthy *by construction*:
the probe asserts wire evidence, not just "the process finished" — the exit-0-is-not-
success trap from the other examples has no place to hide here.

**Observed when verified (2026-11-13, `docker agent` v1.153.0):** exit 0. `initialize` →
`agentInfo: "docker agent v1.153.0"`, `protocolVersion: 1`, `authMethods: ["host-credentials"]`;
`session/new` → `sessionId: 6da7b507-8181-41f4-bdde-0196d250f4d3`; the `session/prompt`
round trip streamed `available_commands_update` (`compact`, `usage`), a
`config_option_update` (tool-safety mode select), `current_mode_update`, and one
`agent_message_chunk` whose content was exactly `{"type":"text","text":"pong"}`
(`messageChunks=1`, `thoughtChunks=0`), resolved by `{"stopReason":"end_turn"}` —
`REPLY: pong`, one tiny local-gemma4 round trip, zero cloud calls. The update stream
also shows the editor-facing config the probe never touched: cagent `configOptions`
expose a tool-safety select (`default|strict|balanced|restricted|autonomous`) and a
per-agent model select (`model:gemma4_local`), both switchable from the editor UI mid-session.

(TDD note for the record: the first probe run was **red** — see the version-envelope
gotcha below. The reply `pong` was already on the wire; the probe was reading the wrong
envelope shape. Fixed to tolerate both shapes, then green.)

## Local ↔ cloud swap (one line)

Identical to every other example — swap one line in the named models entry:

```yaml
models:
  gemma4_local:
    provider: ollama
    model: gemma4:latest          # ← swap to: glm-5.3-flash:cloud (same daemon proxies to Ollama Cloud)
```

The probe (like an editor) does not care which model the config names; with the cloud
swap the streamed answer arrives from Ollama Cloud via the same local daemon (ex01
covered the one-time routing smoke; the committed config stays on local gemma4).

## Gotchas

- **stdio NDJSON framing is the whole contract.** One JSON-RPC object per line on
  stdout; all human-readable logging goes to stderr. Spawn the process directly
  (`node:child_process spawn('docker', ['agent','serve','acp', …])`) — shelling through
  PowerShell 5.1 mangles embedded quotes (the Ex02 lesson again); the probe's prompt has
  no double quotes for the same reason.
- **`protocolVersion` is the number `1`** on this surface (ACP v1 is the Latest stable
  spec line at agentclientprotocol.com as of 2026-11-13; v2 is Draft). Send the number,
  not `"1"`.
- **The wire shape moved between plugin versions — this is the red→green story.** The
  exploration notes' proven v1.145.0 transcript carries update notifications *flat* on
  the notification params: `params.sessionUpdate` + `params.content`. On the v1.153.0
  verified here, the same notifications arrive wrapped in an envelope:
  `params.update.{sessionUpdate, content, …}` — and there are new kinds
  (`config_option_update`, `current_mode_update`). A client pinned to the flat shape
  sees the reply bytes but reads none of them — exactly how the first probe run failed.
  `probe-acp.mjs` parses both envelope shapes; if you hand-roll a client, do the same.
- **Kill the process tree, not the wrapper.** On Windows `docker agent serve <mode>`
  spawns a child `docker-agent.exe`; `child.kill()` alone can orphan it. The probe uses
  `taskkill /pid <pid> /T /F` on success *and* failure paths, and no stray
  `docker-agent` process survived verification. Also note `serve acp` writes no files
  into the working directory (no `session.db` appeared beside the config during runs).
- **Editor verification has a hard limit.** The probe proves the protocol surface
  end to end, but an in-editor session requires a human in the Zed or VS Code UI — a
  script cannot drive that, so this README marks every editor step accordingly instead
  of implying it was run. Treat editor steps as the owner demo, same as the TUI runs.
- **`serve acp` takes no `--safety`/`--listen`/`--http`/`--auth` flags** (observed on
  both plugin versions): tool safety and model are negotiated per session through the
  cagent `configOptions` / `session/set_mode`, not configured at launch. The editor's
  model picker is where the one-line local↔cloud swap surfaces as data, not a flag.
- **Local models stream thoughts.** gemma4 can emit a long run of
  `agent_thought_chunk` notifications before the first `agent_message_chunk` (the
  notes' proven run took ~1 min of thinking for one short line). Render chunks by their
  `sessionUpdate` kind and keep the UI streaming — a client that waits silently for the
  full answer looks hung while the model is thinking.
