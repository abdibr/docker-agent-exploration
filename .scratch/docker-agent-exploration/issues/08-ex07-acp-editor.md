# 08: Ex07 — ACP editor integration

**What to build:** Example 07 — the editor-flavored interop: connect an agent through ACP (Agent Client Protocol — Docker Agent's documented editor integration; not IBM's Agent Communication Protocol) so it works inside an editor as a client. Editor prerequisites, connection configuration, and a successful manual session are documented; headless checks wherever the protocol allows.

**Blocked by:** 02: Ex01 — First agent.

**Status:** resolved

- [x] Editor prerequisites and connection steps documented for this machine, with notes to generalize them to other setups
- [ ] A manual editor session succeeds (agent responding inside the editor), as evidenced by a documented transcript or screenshots path in the README; headless verification included where possible
- [x] README documents ACP vs the other flavors, commands, gotchas
- [x] Exactly one commit containing all Example 07 artifacts

## Comments

### 2026-11-13 (impl-08) — built, red→green probe-verified over the ACP wire, resolved — one box honestly left unticked

Environment: `docker agent` v1.153.0 (commit 8f0eb5c05f878baaf32215dadd0652654081f4eb — the post-auto-update baseline), Windows 11 + PowerShell 5.1, Ollama daemon running with `gemma4:latest`, Node v24. Base fast-forwarded to integration tip ea6cb4e (tickets 04+05 merged) before work began. Zero cloud model calls; the only model involved in verification is local gemma4.

**TDD seam (per spec Testing Decisions):** the ONE machine-verification command is `node .\probe-acp.mjs` from `ex07-acp-editor\` — a zero-dependency Node 24 script (stdlib only, no npm install) that spawns `docker agent serve acp .\agent.yaml` as a piped-stdio subprocess exactly the way an ACP host/editor would. External behavior asserted, nothing else: (1) `initialize` negotiates `protocolVersion: 1` (number, with `agentInfo docker agent v1.153.0`, `authMethods: ["host-credentials"]`); (2) `session/new` returns a real `sessionId` (plus cagent `configOptions` exposing tool-safety and per-agent model selects to the editor); (3) the answer text arrives via streamed `session/update` → `agent_message_chunk`; (4) the prompt resolves with `stopReason: "end_turn"`. Kills the process tree (`taskkill /T /F`) on success and failure; exits 0/1 accordingly.

**RED (before any fix, observed live):** the first probe run exited 1 — `no agent_message_chunk text arrived` — while the raw log visibly contained `"update":{"content":{"text":"pong"…`. The exploration notes' proven transcript was v1.145.0, where update notifications sit **flat** on the notification params (`params.sessionUpdate` + `params.content`); on v1.153.0 the same notifications arrive wrapped in an **envelope**: `params.update.{sessionUpdate, content, …}` — plus new kinds (`config_option_update`, `current_mode_update`). The reply was on the wire; the probe read the wrong shape. A one-off full-line capture (`capture-acp-shape.mjs` in the notes dir, outside the repo) recorded the exact v1.153.0 envelope verbatim before the fix.

**GREEN:** collector made dual-shape tolerant (v1.145.0 flat vs v1.153.0 envelope) → `node .\probe-acp.mjs` → **exit 0**. Verbatim evidence now quoted in the README: initialize → `agentInfo: "docker agent v1.153.0"`, `protocolVersion: 1`; `session/new` → `sessionId: 6da7b507-8181-41f4-bdde-0196d250f4d3`; `session/prompt` "Reply with the single word: pong" → `available_commands_update` (`compact`, `usage`), `config_option_update` (safety-mode select `default|strict|balanced|restricted|autonomous`), `current_mode_update`, one `agent_message_chunk` content exactly `{"type":"text","text":"pong"}` (`messageChunks=1`, `thoughtChunks=0`), resolved by `{"stopReason":"end_turn"}`; `REPLY: pong`. Full ACP v1 session lifecycle proven on live local gemma4, zero cloud calls, no stray `docker-agent` processes, no `session.db` left beside the config.

**Editor side — documented with explicit verified/unverified markers (this machine):** Zed is the reference ACP host but is **NOT installed** — README documents the install route and the `agent_servers` custom-agent snippet for `docker agent serve acp` (shape captured verbatim from Zed's external-agents docs in the exploration notes), clearly marked **UNVERIFIED-ON-THIS-MACHINE / owner hands-on demo**, same status as the TUI demos in Ex01/Ex02. VS Code 1.143.1 is installed but does not speak ACP natively; ONE bounded web check (agentclientprotocol.com/overview/clients, 2026-11-13) confirms real third-party VS Code ACP-host extensions exist (ACP Client extension, ACP Patchbay, ACP Pro — also for Cursor/Windsurf/Trae, Exo for VSCode); none installed or attempted here, so exactly that is documented. Claude Code 2.1.101 is an MCP client, not an ACP host — its docker-agent bridge is Ex05's `serve mcp` (already live-verified there); the README says so to prevent the wrong-protocol confusion.

**UNTICKED BOX, honest reason:** "*A manual editor session succeeds…*" is NOT ticked — no ACP host is installed on this machine (Zed absent; VS Code needs a third-party ACP-host extension that was not installed/attempted), so no agent responded inside any editor during this session, and fabricating a transcript/screenshots path was worse than stating the gap. The spirit of the box is covered as far as the machine allows: the headless probe proves the exact protocol surface an editor drives (initialize → session/new → prompt → streamed updates → end_turn) — "headless verification included where possible", literally. The owner's Zed demo remains the one step that can close this box.

Files: `ex07-acp-editor/` — `agent.yaml` (local gemma4 via named `gemma4_local`, no toolsets, `max_iterations: 6`), `probe-acp.mjs`, `README.md`. Scratch during verification (probe run logs, notes-dir capture) stays outside the repo; run logs deleted, capture artifacts kept with the exploration notes per their convention.
