# Mission: Docker Agent (Docker's declarative agent runtime)

## Why
This repo (`docker_agents`) was explored and built largely *by agents*: examples Ex01–Ex07 are verified green, and the phase deliberately paused with "the next move belongs to the owner." To own that next move — choosing the first real problem and the right interop flavor for it — the owner needs first-hand understanding of Docker Agent. The teaching vehicle is self-contained HTML lessons in this workspace, each built directly on the repo's own verified examples.

## Success looks like
- Can read any of the seven `ex*/agent.yaml` configs and explain every key, including the gotchas each example recorded
- Can run Ex01 hands-on and judge success correctly: exit 0 **plus** transcript content (exit 0 ≠ success)
- Can decide, for a new problem, which flavor fits (catalog MCP vs custom MCP server vs sub-agents vs A2A vs ACP serve seat) using the repo's decision rules
- Comfortable with the local-first run discipline: Ollama daemon, safety modes, the headless verification template

## Constraints
- Local-first models by default: free Ollama daemon (`gemma4:latest`); cloud (`glm-5.3-flash:cloud`) only in tiny pre-approved smokes
- Machine: Windows 11 + PowerShell 5.1; Docker Desktop + Ollama daemon must be running for hands-on runs
- Learning preference: big picture first, then hands-on (stated at session 1)
- Lessons are standalone HTML pages the owner can revisit offline

## Out of scope
- Gordon (`docker ai`), IBM's Agent Communication Protocol, CI-automated verification, remote git hosting (per the repo's spec)
- Go internals / SDK embedding of the runtime; TypeScript MCP SDK patterns (the repo's philosophy is no glue code, no SDK)
- Cloud model spend beyond the documented one-line smokes