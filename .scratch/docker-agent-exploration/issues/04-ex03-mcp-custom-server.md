# 04: Ex03 — Custom MCP server in TypeScript, containerized

**What to build:** Example 03 — learn MCP from the server side: a hand-written MCP server in TypeScript exposing one small deterministic tool, containerized, and wired into an agent through Docker's custom-tool path (this keeps Docker's security/isolation story intact — the tool runs as a container an agent talks to). The round trip is verified agent-mediated; a minimal direct protocol probe may supplement it.

**Blocked by:** 02: Ex01 — First agent.

**Status:** resolved

- [x] TypeScript MCP server with one deterministic tool builds and runs inside its container on this machine (Node v24 toolchain)
- [x] Headless agent run exercises the custom tool and the result round-trips into the final answer
- [x] Server is containerized and consumed via the agent config, not via an ad-hoc local process outside Docker's story
- [x] README documents server-side MCP concepts learned (transport, tool schema), TUI + headless commands, model swap, gotchas hit while building
- [x] Exactly one commit containing all Example 03 artifacts (example + server code + container config)

## Comments

### 2026-11-13 (impl-04) — built, red→green verified agent-mediated, resolved

Environment: `docker agent` v1.153.0 (commit 8f0eb5c05f878baaf32215dadd0652654081f4eb — the notes' mid-session auto-update baseline), Docker Engine 29.9.3, Windows 11 + PowerShell 5.1, Ollama daemon running with `gemma4:latest`. Zero cloud model calls; the only model involved in verification runs is local gemma4.

**TDD seam (per spec Testing Decisions):** the ONE machine-verification command is a headless `--exec` run at the Docker Agent CLI boundary; supplemented by a model-free direct MCP protocol probe through the same `docker run --rm -i` command the agent uses.

**RED (run before `docker build`, honest failure observed at both layers):**
- `docker agent debug toolsets .\agent.yaml` → exit 0, but only the 10 built-in tools listed — **no `echo`**. A missing image manifests as a zero-tool MCP toolset contribution, silently, with exit 0.
- `docker agent run .\agent.yaml --exec '…echo exactly this text: round trip check 42…' --safety autonomous` → transcript banner `⚠️ Some toolsets failed to initialize for agent 'root'` + `mcp(stdio cmd=docker args_len=4) start failed: failed to initialize MCP client: connection closed: calling "initialize": client is closing: EOF` (container exits instantly → EOF during handshake); gemma4 attempted the call anyway and got `echo response → "Tool 'echo' is not available. You can only use the tools provided to you."`, then reported the failure plainly (the config's honesty instruction held). **EXITCODE=0** — the repo's documented exit-0≠success anti-pattern, now with a new third variant (missing image).

**GREEN (iterating to green):**
1. `docker build -t mcp-ex03-echo:local .` → exit 0; image `mcp-ex03-echo:local`, 172 MB, node:24-alpine; in-image `node --version` → v24.22.3.
2. Direct protocol probe `cmd /c "type req.txt | docker run --rm -i mcp-ex03-echo:local"` → exit 0; three NDJSON responses: `initialize` (serverInfo mcp-echo 1.0.0), `tools/list` (echo tool + its JSON Schema), `tools/call` → `ECHO: hello from docker (17 chars)`, `isError:false`. The server speaks MCP inside the container, model-free.
3. `docker agent debug toolsets .\agent.yaml` → exit 0, **11 tools**, including `+ echo - Echoes back the given message prefixed with "ECHO:", plus the character count.` — tool discovery through the real in-container spawn (allowlist kept the surface at one MCP tool).
4. **THE verification command, now green** — `docker agent run .\agent.yaml --exec 'Use the echo tool from your custom MCP server to echo exactly this text: round trip check 42. Then answer with exactly two lines. Line 1: the exact text the echo tool returned. Line 2: the character count it reported.' --safety autonomous` → EXITCODE=0; transcript: `Calling echo(message: "round trip check 42")`, `echo response → "ECHO: round trip check 42 (19 chars)"`, final answer exactly `ECHO: round trip check 42 (19 chars)` / `19 chars`. The containerized server's output demonstrably shaped the answer; no toolset-failure banner this time.

**Safety-mode check (required by ticket instructions):** `--safety restricted` run on the identical task → the echo call was auto-denied: `Tool 'echo' is denied by the restricted safety mode: the call is not classified safe, and the mode's fallback denies instead of asking for confirmation.` (exit 0). Same verdict as Ex02's catalog tools, so the template runs `--safety autonomous` and the README documents why.

**Cleanup/lifecycle:** after runs, `docker ps -a` shows **no** containers for `mcp-ex03-echo:local` (`--rm` teardown; gateway-independent — image lifecycle is user-managed). Scratch launcher/tmp files for the long-run polls live under %TEMP%\ex03-verify, outside the repo; no repo-side pollution. No stray processes left (background runs all EXITED).

**NOT verified (honest list):** the TUI run itself (interactive approval prompt described from the Ex02/notes pattern, not exercised this session); `lifecycle: {profile: strict}` knob (left unverified-deduced, flagged in README gotchas); the cloud-swap path is documented per the template but not re-run (Ex01's pre-approved one-time cloud smoke covers routing); the server's `notifications/initialized`/`ping` handling is covered only by code review + the protocol probe's four-recorded methods. Consumption shape committed to: inline `toolsets: [{type: mcp, command: docker, args: [run, --rm, -i, mcp-ex03-echo:local]}]` with `tools: [echo]` allowlist; the alternative verified `mcps:` + `ref:` shape is documented and shown in the README, taken from the exploration notes (live-verified there on this machine).

Files: `ex03-mcp-custom-server/` — `agent.yaml`, `server.ts`, `Dockerfile`, `req.txt`, `README.md`.
