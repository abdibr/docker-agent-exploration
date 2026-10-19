# 03: Ex02 — MCP client via Docker catalog tool

**What to build:** Example 02 — the same agent pattern but now reaching outside itself: an MCP toolset added by reference to a containerized tool from Docker's MCP catalog (web search), proving Docker's recommended external-tool path — isolated, containerized, no local installation. A headless run must show the tool actually fired and that search results shaped the final answer.

**Blocked by:** 02: Ex01 — First agent.

**Status:** ready-for-agent

- [ ] Config adds a catalog MCP toolset by reference; no local MCP server install is required
- [ ] Headless run proves a real web search occurred and its results appear in the answer
- [ ] README documents: what it teaches, TUI + headless commands, model swap, gotchas (e.g., tool-approval behavior when scripts run)
- [ ] Exactly one commit containing all Example 02 artifacts