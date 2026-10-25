# 03: Ex02 — MCP client via Docker catalog tool

**What to build:** Example 02 — the same agent pattern but now reaching outside itself: an MCP toolset added by reference to a containerized tool from Docker's MCP catalog (web search), proving Docker's recommended external-tool path — isolated, containerized, no local installation. A headless run must show the tool actually fired and that search results shaped the final answer.

**Blocked by:** 02: Ex01 — First agent.

**Status:** resolved

- [x] Config adds a catalog MCP toolset by reference; no local MCP server install is required
- [x] Headless run proves a real web search occurred and its results appear in the answer
- [x] README documents: what it teaches, TUI + headless commands, model swap, gotchas (e.g., tool-approval behavior when scripts run)
- [x] Exactly one commit containing all Example 02 artifacts

## Comments

- **2026-10-25 — resolved with run evidence.** Config `ex02-mcp-catalog-tool/agent.yaml`: the Ex01 pattern (named models entry `gemma4_local`, `filesystem` sandboxed to `.`, `think`, local `gemma4:latest`) plus the new toolset `- type: mcp, ref: docker:duckduckgo` with `tools: [search]` — the MCP server exists only as a catalog reference (snapshot resolves it to `mcp/duckduckgo@sha256:5617c4c6…`, "Private Web Search", egress-limited to `html.duckduckgo.com:443`); no local MCP install, no API key, nothing to configure. Validated without a model via `--dry-run` + `docker agent debug toolsets` (11 concrete tools: 9 filesystem + think + the catalog `search`). Headless verification (`docker agent` v1.145.0, 2026-10-25): `--exec 'Use your web-search MCP tool: …' --safety autonomous` → **exit 0**; transcript shows the real call `search(max_results: 1, query: "Docker MCP Gateway GitHub repository", region: "wt-wt")`, the tool response `Found 1 search results: … GitHub / URL: https://github.com/docker/mcp-gateway`, and the two-line answer quoting that URL and exact title — search results shaped the answer; no local image/container remnants after runs (gateway-managed lifecycle). Tool-approval gotcha proven exactly as anticipated: the same task under `--safety restricted` was auto-denied (`Tool 'search' is denied by the restricted safety mode…` — still exit 0), so this example's one verification command uses `autonomous` instead; also hit PowerShell 5.1 mangling embedded double quotes in `--exec` (quoted words arrived as separate user turns) — gotchas documented in the example README. Two-axis code review (standards + spec) ran before the commit; applied fixes: Ollama daemon prerequisite added, `fetch_content` dropped from the allowlist (scope creep — verified re-run against the final config), full digest cited with honest "resolved at snapshot" wording, run-modes.md cross-link added, trailing newlines fixed. Testing Decision honored: no unit tests; verification-first loop at the spec's single allowed seam, attempted under restricted (failed → denial recorded as the gotcha), then autonomous (green against the final config).
