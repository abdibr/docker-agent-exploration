# 06: Ex05 — Agent exposed as an MCP server

**What to build:** Example 05 — flip the direction from Example 02/03: the agent itself runs in MCP-server mode and is consumed by a standard MCP client, completing a full round trip (task in → observable result out). This is the directly reusable scaffolding for future "agent as tool" integration in real projects.

**Blocked by:** 02: Ex01 — First agent.

**Status:** ready-for-agent

- [ ] Agent runs in MCP-server mode and appears as a working tool to a standard MCP client
- [ ] Round trip verified: client issues a task, receives an observable result, exits cleanly
- [ ] README documents: how agent-as-MCP-server differs from agent-using-MCP-tools, TUI/headless notes, gotchas
- [ ] Exactly one commit containing all Example 05 artifacts