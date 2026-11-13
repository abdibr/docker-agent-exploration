# 06: Ex05 — Agent exposed as an MCP server

**What to build:** Example 05 — flip the direction from Example 02/03: the agent itself runs in MCP-server mode and is consumed by a standard MCP client, completing a full round trip (task in → observable result out). This is the directly reusable scaffolding for future "agent as tool" integration in real projects.

**Blocked by:** 02: Ex01 — First agent.

**Status:** resolved

- [x] Agent runs in MCP-server mode and appears as a working tool to a standard MCP client
- [x] Round trip verified: client issues a task, receives an observable result, exits cleanly
- [x] README documents: how agent-as-MCP-server differs from agent-using-MCP-tools, TUI/headless notes, gotchas
- [x] Exactly one commit containing all Example 05 artifacts

## Comments

2026-11-13 — implementer subagent `impl-06`. Verified on `docker agent` **v1.153.0**
(Commit `8f0eb5c05f878baaf32215dadd0652654081f4eb`), Node v24.12.0, local
`gemma4:latest` via host Ollama. Zero cloud calls, zero secrets, no processes or ports
left behind.

**TDD:** `probe-mcp.mjs` (the example's ONE verification command, zero-dependency) was
written first. **RED:** it failed honestly — server rejected `unknown flag:
--session-db` (`serve mcp` has no such flag; the global `--data-dir <dir>` was used
instead — a live correction to the exploration notes' serve-mcp flag list). **GREEN:**
after `agent.yaml` existed, two consecutive runs completed with exit 0.

**Evidence — verbatim key lines from the verified run (`node .\probe-mcp.mjs`, exit 0):**

- initialize reply (assertions on serverInfo/protocolVersion all PASS):
  `{"jsonrpc":"2.0","id":1,"result":{"capabilities":{"tools":{"listChanged":true}},"protocolVersion":"2025-06-18","serverInfo":{"name":"docker agent","version":"v1.153.0"}}}`
  — note v1.153.0 no longer advertises `logging:{}` (v1.145.0 did); the probe stays
  capability-agnostic by design.
- tools/list (assertions: exactly one tool / name / description / schemas all PASS):
  `{"result":{"ttlMs":0,"cacheScope":"public","tools":[{"annotations":{...,"title":"Ex05 agent exposed as an MCP server - one short, tool-free answer per message"},"description":"Ex05 agent exposed as an MCP server - one short, tool-free answer per message","inputSchema":{"additionalProperties":false,"properties":{"message":{"description":"the message to send to the agent","type":"string"}},"required":["message"],"type":"object"},"name":"root","outputSchema":{"additionalProperties":false,"properties":{"response":{"description":"the response from the agent","type":"string"}},"required":["response"],"type":"object"}}]}}`
- tools/call (task "Reply with the single word: pong"; the inner agent's model answered):
  `{"content":[{"type":"text","text":"{\"response\":\"pong\"}"}],"structuredContent":{"response":"pong"}}`
  — the answer travels twice: raw JSON string in `content`, typed `pong` in
  `structuredContent.response`.
- Shutdown: `[probe] stopping serve process (finish)` → `taskkill /pid <pid> /T /F`;
  `[probe] PASSED - full MCP round trip verified`; probe exit code 0. Post-run checks:
  no `docker-agent.exe` processes remaining, no listeners on 8080–8083.

**Tool approvals:** `agent.yaml` declares **no toolsets** (`docker agent debug toolsets
.\agent.yaml` → `No tools for root`, exit 0), so the serve round trip never faces an
approval decision under serve's default `restricted` tool-safety profile. Help-text
finding: `--safety`/`--auth-token` are only valid with `--http` on serve mcp.

**Files created** (in `ex05-agent-as-mcp-server/`): `agent.yaml` (root agent, named
`gemma4_local` model entry, no toolsets, `max_iterations: 4`), `probe-mcp.mjs`
(event-driven NDJSON handshake adapted from the notes' proven `mcp-client-probe.mjs` +
per-step assertions + Windows tree-kill), `README.md` (direction-flip story, client
snippets incl. the owner-demo `claude mcp add` route, verification template, gotchas).

**Cross-references:** exploration notes
`D:\agents_proj\docker_agents-notes\ex05-serve-mcp.md` — Claude Code (2.1.101)
`claude mcp add` → `✓ Connected` was LIVE-verified for this exact surface there and is
documented as an owner-demo option, not the verification path. The HTTP variant's
stateless `2026-07-28` semantics (`POST`-only, path-agnostic, SSE-wrapped, `202` for
notifications, no `Mcp-Session-Id`, `GET` → 405) come from that note's dedicated HTTP
probe (`mcp-http-probe.mjs`, `obs-serve-mcp-http.txt`) and are incorporated in the
README.

**Unverified leftovers, for the record:** the HTTP transport path was not re-run today
(noted findings incorporated as-is); MCP Inspector and VS Code `.vscode/mcp.json` client
shapes are documented as standard but were not exercised on this machine; a multi-agent
`serve mcp` (all agents as separate tools) was not exercised — today's evidence covers
the single-agent case.
