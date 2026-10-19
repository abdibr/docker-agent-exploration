# 05: Ex04 — Native sub-agent team

**What to build:** Example 04 — native multi-agent delegation with zero protocol machinery: a lead agent delegates to two or more specialized sub-agents via Docker Agent's built-in sub-agents mechanism (planner/reviewer or debugger/fixer pattern). Defaults to the cloud agentic model (`glm-5.3-flash:cloud`) for reasoning depth, with a documented one-line local swap; cloud spend bounded to this one normal-size run.

**Blocked by:** 02: Ex01 — First agent.

**Status:** ready-for-agent

- [ ] Config defines a lead agent plus at least two sub-agents with distinct roles using the native sub-agents mechanism
- [ ] Headless run shows delegation visibly happening (sub-agent contributions identifiable in the output)
- [ ] Documented one-line swap to local `gemma4:latest`, including the quality/routing tradeoff of making that swap
- [ ] README documents: when delegation beats plain tools, TUI + headless commands, cloud-cost note, gotchas
- [ ] Exactly one commit containing all Example 04 artifacts