# Flavor cheat-sheet — which interop surface, when

**Scope:** every flavor this exploration actually built and verified (native sub-agents,
MCP as client in two variants, agent as MCP server, A2A, ACP), plus the adjacent run
surfaces that are documented but were deliberately not built this phase. `run-modes.md`
answers "how do I run it"; this sheet answers "which seat at the table do I want and
when". Written at phase exit — ticket
[`09-flavors-cheatsheet`](../../.scratch/docker-agent-exploration/issues/09-flavors-cheatsheet.md).

**Distilled from:** run evidence recorded on this machine on 2026-10-19–20 (Ex01),
2026-10-25 (Ex02) and 2026-11-13 (Ex03–Ex07), against `docker agent` v1.145.0 →
v1.153.0 (Docker Desktop auto-updated the CLI mid-phase; per-flavor notes record which
version each claim was verified on). Re-checked at phase exit with a fresh local Ex01
spot check — see the ticket for the recorded exit code and answer lines. Environment:
Windows 11 + PowerShell 5.1, Docker Engine 29.8.2→29.9.3, Ollama v0.40.5 at
`localhost:11434`, local `gemma4:latest` (cloud `glm-5.3-flash:cloud` routed through the
same daemon; used once, pre-approved, in Ex04).

**The mental model in one line each** (from [Ex07's cross-flavor
table](../../ex07-acp-editor/README.md)):
**MCP wires tools into an agent** (or the agent out as one tool); **A2A delegates work
between agents** over a network, with discovery; **`sub_agents` is multi-role work
inside one config**; **ACP is the editor-facing seat** — the human's tool is the peer.

---

## The comparison table (decision-ready)

| Flavor | Example | What it's for | Isolation story | Cost profile | Complexity | When to reach for it |
|---|---|---|---|---|---|---|
| **Native sub-agents** (`sub_agents:`) | [Ex04](../../ex04-sub-agents/README.md) | Delegate *roles* (planner, reviewer, …) from a lead agent — multi-step work with per-role instructions, tool surfaces and output composition | All in-process: one config, one model daemon; sub-agents get a **fresh view containing only what the lead forwarded** — the context boundary | Highest of the built-ins: one task fans out into ~5 model chats (lead turns + a full nested chat per sub-agent); token spend multiplies — hence Ex04's cloud default | Lowest: zero protocol machinery, one YAML file (`sub_agents:` list hands the lead a `transfer_task` tool) | Work splits into *roles* and the lead should compose the answer. Reach for it **first** — before any protocol machinery |
| **MCP client, catalog ref** (`type: mcp, ref: docker:…`) | [Ex02](../../ex02-mcp-catalog-tool/README.md) | Give an agent proven, containerized tools (web search, …) with **no server code and no local install** — the `ref` plus Docker's catalog snapshot *is* the server | Strongest: the MCP gateway runs a digest-pinned, egress-restricted container per call; nothing local persists (no image/container remnants observed after runs) | Tool call adds network latency inside the container (~40 s first call, gateway start + image pull); cloud-model spend only if swapped | Lowest possible: one toolset entry + optional `tools:` allowlist | Off-the-shelf capability, quickly, under Docker's isolation model. Constrained by the catalog: keyed entries need secrets (out of scope this phase) |
| **MCP client, custom server** (`type: mcp, command: docker run --rm -i <img>`) | [Ex03](../../ex03-mcp-custom-server/README.md) | The same seat with **your own server** — deterministic, testable tools you wrote; learn MCP from the server side (~100 lines, no SDK) | You own it: you build and tag the image; the config spawns `docker run --rm -i` per session — per-session container, `--rm` teardown, image stays until `docker rmi` | Model cost unchanged; one-time `docker build` (172 MB image); per-call cost is container spin-up (sub-second on a warm engine) | Middle: server code + Dockerfile + image lifecycle are yours; the YAML stays one toolset entry | You need a tool the catalog doesn't have, or want deterministic behavior and an honest protocol education. Transport follows consumption: spawning via `command:` means **stdio NDJSON** |
| **Agent as MCP server** (`serve mcp`) | [Ex05](../../ex05-agent-as-mcp-server/README.md) | Make *your agent callable as a tool* from any standard MCP client (Claude Code, Inspector, VS Code, SDKs) — agent-as-tool integration in one line of CLI | The served process is the boundary: stdio NDJSON (default, accepts no `--safety`/`--auth-token`) or a **stateless** HTTP variant (`--http`, default `127.0.0.1:8081`, auth required for non-loopback binds) | One full LLM chat per `tools/call` (~20 s on local gemma4); serving itself is free | Low: no config change at all — the same YAML, one serve verb. Client work is someone else's | You want your agent embedded in *someone else's toolbox*. One tool per agent, named after the agent; write the agent's `description:` like a tool description |
| **Agent over A2A** (`serve a2a`) | [Ex06](../../ex06-a2a/README.md) | Make your agent a **discoverable peer** for other agents: agent card, JSON-RPC task lifecycle (`SendMessage` → `TASK_STATE_COMPLETED` + artifacts) | HTTP peer at a port (default `127.0.0.1:8082`, `--listen` to move); card at `/.well-known/agent-card.json`; task state lives server-side (context/task IDs, history) — designed for *ongoing* inter-agent work | One LLM round trip per task (331–496 ms overhead beyond the model on this build); serving itself is free | Low: no config change; the surface's complexity is the protocol's (A2A v1.0 CamelCase methods; legacy `agent.json` discovery is 404) | You want agents to **discover each other, hand off tasks, and follow task state** over HTTP — the agent-to-agent seat |
| **ACP** (`serve acp`) | [Ex07](../../ex07-acp-editor/README.md) | Put the agent **inside an editor**: the host (e.g. Zed) spawns it as a subprocess and drives a session — streamed updates, thought-vs-message rendering, tool approvals, mid-session mode/model control | stdio-only, designed to be a child process (LSP/DAP shape); no flags at all (no `--listen`/`--http`/`--safety`) — mode and model are negotiated per session via `configOptions` from the host's UI | Local models stream thoughts (~1 min of `agent_thought_chunk` before the answer on gemma4); serving itself is free | Low protocol complexity for the agent owner (no config change); the host/editor side is where integration effort goes | The **human in an editor** is the peer. The only flavor whose peer is a person's tool rather than a machine protocol |

Per-flavor detail (commands, verification templates, gotchas) lives in each example's
README — links above. Cross-cutting findings behind several of these rows: the finalized
[phase notes](phase-notes.md).

---
## Short per-flavor verdicts

### Native sub-agents — "delegate roles, compose the answer" (Ex04)

`sub_agents: [planner, reviewer]` on sibling `agents:` entries. Listing them hands the
lead a `transfer_task` tool (params `{agent, task, expected_output}`) — **lead-only**;
sub-agents never get it unless they declare their own `sub_agents:`. Delegation is not a
conversation handoff: the sub-agent's answer returns as the `transfer_task` tool result.
Safety finding: delegating to a declared sub-agent is classified **safe under
`--safety restricted`** (auto-approved) — the opposite of arbitrary MCP tools. Cost
caution: a one-user-task run fans into ~5 model chats; Ex04 defaults to the
`glm-5.3-flash:cloud` agentic model because delegation choreography is multi-hop
reasoning, with the one-line local swap documented for cheap iteration.

### MCP as client, catalog — "borrow a tool, containerized" (Ex02)

`ref: docker:duckduckgo` is the whole server description; the gateway resolves it to a
digest-pinned image with egress restricted to what the tool needs, pulls on first call,
and tears down after. No keys, no local install — DuckDuckGo was picked over
brave/tavily/exa precisely to stay key-free. A `tools:` allowlist beats none. The
catalog ref carries **no version**: what Docker resolves is the snapshot's pin, and a
newer catalog can move it (and the tool schemas with it).

### MCP as client, custom server — "own the tool, keep the isolation" (Ex03)

`server.ts` (one `echo` tool, a JSON-Schema `inputSchema`, and a tool description
written "as if prompting the model — because it is one"), 6-line Dockerfile on
`node:24-alpine` — Node 24 executes `.ts` directly. The agent config spawns
`docker run --rm -i mcp-ex03-echo:local` and speaks MCP stdio over the container's
stdin/stdout; stderr stays your log channel (stdout must be pure NDJSON). An inline
`command:`/`args:` toolset (used here) or a named `mcps:` block + `agent-side ref:`
(pays off when several agents share one server) are the two verified shapes; there is
**no `image:` key and no URL consumption for local servers**.

### Agent as MCP server — "your agent is a tool" (Ex05)

`docker agent serve mcp agent.yaml`. `tools/list` returns one tool per agent, named
after it (`--tool-name` override only when exposing a single agent); input
`{message}`/output `{response}`; the tool `description` is the agent's `description:` —
write it like a tool description. Annotations are generic (`readOnlyHint: true` even
though a call runs a full LLM chat) — do not read safety into them. Verified with a
zero-dependency stdio probe *and* a live standard client (Claude Code `✓ Connected`);
the `--http` variant is stateless per MCP `2026-07-28` (POST-only, SSE-wrapped, no
`Mcp-Session-Id`); `--safety`/`--auth-token` exist **only** on the HTTP variant.

### A2A — "your agent is a peer" (Ex06)

`docker agent serve a2a`. Discovery is the agent card
(`GET /.well-known/agent-card.json`); one `SendMessage` returns a whole **task
object** — `status.state` → `TASK_STATE_COMPLETED`, `history[]`, `artifacts[]`,
`contextId` — an answer to *forward*, not just text to *display*. This build speaks
A2A v1.0 CamelCase methods (`message/send` → -32601); the card `name` is the **config
file's stem**, not the agent name. Contrast with MCP-server mode: MCP embeds the agent
in a toolbox with a call/return shape; A2A gives agents an HTTP home page, discovery,
and a state machine for ongoing work.

### ACP — "your agent is an editor citizen" (Ex07)

`docker agent serve acp` — the fifth serve surface and the only stdio-only one with no
listen/http/safety/auth flags: the editor spawns it like any language server. The
handshake (`initialize` → `session/new` → `session/prompt` streamed `session/update` →
`{stopReason: "end_turn"}`) is machine-verified on the wire with a zero-dependency
probe; an in-editor session (Zed is the reference host) is documented as the owner
hands-on demo — no ACP host was installed on this machine, and the README marks every
editor step accordingly. ACP exists because editors need more than one-shot tool calls:
a persisting session, streaming, permission prompts, diff-oriented edits.

---

## Cross-flavor cautions (found in more than one flavor)

- **Exit 0 is not success — everywhere.** Denied tool calls (Ex01/Ex02/Ex03), missing
  tool images (Ex03), and degenerate tool loops (Ex01/Ex02) all still exit 0. Judge the
  transcript or the protocol surface, never the exit code — the full discipline is in
  the [phase notes](phase-notes.md#4-exit-0-is-not-success--the-discipline-earned-in-every-example).
- **MCP calls are not on the provably-safe list; delegation is.** Under the
  unattended-friendly `--safety restricted`, catalog and custom MCP calls are
  auto-denied (Ex02, Ex03 — correct fail-closed behavior), while `transfer_task`
  delegation is auto-approved (Ex04). The unattended MCP examples therefore verify with
  `--safety autonomous` (deliberate one-shots), and Ex04 keeps `restricted`.
- **Serving defaults to `restricted` tool safety** (observed serve banner in Ex05/Ex06)
  and is only comfortable because those configs declare **no toolsets** — a served
  agent with toolsets inherits the same fail-closed behavior the `run` examples
  document.
- **The CLI moved mid-phase (v1.145.0 → v1.153.0) and protocol shapes moved with it.**
  Core surfaces proved stable; observable deltas: MCP `initialize` dropped the
  `logging:{}` capability; ACP update notifications grew an envelope; the A2A card grew
  `capabilities.pushNotifications:false`. Script against field *presence and meaning*,
  not exact snapshots — details in the
  [phase notes](phase-notes.md#2-the-cli-moved-mid-phase-v11450--v11530--shapes-mostly-stable).

---

## Adjacent surfaces — documented, not built this phase

These live in the run-surface catalog ([run-modes.md](run-modes.md)) and in the CLI
inventory captured in the exploration notes; none was exercised by an example:

- **Headless CLI (`run --exec`, `--json`, stdin).** Not an interop flavor but the
  phase's single verification seam: every example's machine-verification command is a
  headless run at the CLI boundary.
- **HTTP API (`serve api`) — default `127.0.0.1:8080`.** A session-based REST surface
  (`POST /api/sessions`, `--auth-token` bearer, `--session-workingdir-root` to scope
  multi-user setups). Documented from `--help` text; never probed.
- **Chat surface (`serve chat`) — default `127.0.0.1:8083`.** OpenAI-compatible chat
  completions over the agent. Documented from the port map; never probed.
- **OCI share (`docker agent share push` / `pull`).** Push/pull an agent config as an
  OCI artifact — and note `sub_agents:` and serve surfaces accept OCI refs directly.
  Out of scope this phase per the spec (needs a registry); the closest verified
  behavior is that a non-path argument to `run` is parsed as a registry reference.
- Those last three therefore carry the honest label: **documented as surfaces the CLI
  exposes, unverified on this machine** — an owner next step if a use case needs them.

## Stop here — the deliberate pause

The spec's exit condition is now met: examples 01–07 verified green plus this
cheat-sheet. This ticket ends the exploration phase: **no real-problem work has been
started** — choosing the first real problem, and which flavor(s) to build it on,
belongs to the repo owner. The table above is the starting point for that decision;
the [phase notes](phase-notes.md) hold what the examples cost and taught on the way.




