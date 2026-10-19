# 04: Ex03 — Custom MCP server in TypeScript, containerized

**What to build:** Example 03 — learn MCP from the server side: a hand-written MCP server in TypeScript exposing one small deterministic tool, containerized, and wired into an agent through Docker's custom-tool path (this keeps Docker's security/isolation story intact — the tool runs as a container an agent talks to). The round trip is verified agent-mediated; a minimal direct protocol probe may supplement it.

**Blocked by:** 02: Ex01 — First agent.

**Status:** ready-for-agent

- [ ] TypeScript MCP server with one deterministic tool builds and runs inside its container on this machine (Node v24 toolchain)
- [ ] Headless agent run exercises the custom tool and the result round-trips into the final answer
- [ ] Server is containerized and consumed via the agent config, not via an ad-hoc local process outside Docker's story
- [ ] README documents server-side MCP concepts learned (transport, tool schema), TUI + headless commands, model swap, gotchas hit while building
- [ ] Exactly one commit containing all Example 03 artifacts (example + server code + container config)