# Docker Agent & interop-flavors exploration

A hands-on exploration of Docker's declarative agent runtime (`docker agent`) and the agent-interop landscape around it — MCP (as client and as server), native sub-agents, A2A, and ACP — built as a sequence of small, self-contained, verified YAML-config examples, then distilled into a comparison cheat-sheet.

Spec of record: [`.scratch/docker-agent-exploration/spec.md`](.scratch/docker-agent-exploration/spec.md) — every decision below was agreed there with the repo owner. Work is ticketed under [`issues/`](.scratch/docker-agent-exploration/issues/) in the same directory.

## The example sequence (01–07)

One numbered, self-contained directory per flavor so setup never leaks between topics. Each example ships its own README (what it teaches, TUI + headless commands, the one-line model swap, gotchas hit while building) and lands as exactly one commit.

1. **Ex01 — First agent.** The smallest working agent: a declarative YAML config on Docker Agent's built-in `ollama` provider using local `gemma4:latest`, exercising built-in toolsets (filesystem, shell, think) — the "no glue code" philosophy on display. Its headless run becomes the verification template every later example reuses.
2. **Ex02 — MCP client via catalog tool.** An MCP toolset added by reference to a containerized tool from Docker's MCP catalog — isolated, containerized, no local install; a headless run proves the tool fired and shaped the answer.
3. **Ex03 — Custom MCP server (TypeScript), containerized.** Learning MCP from the server side: a hand-written server with one deterministic tool, containerized and consumed by an agent to keep the isolation story intact.
4. **Ex04 — Native sub-agent team.** A lead agent delegates to specialised sub-agents via the built-in sub-agents mechanism — delegation with zero protocol machinery.
5. **Ex05 — Agent as MCP server.** The direction flipped: the agent runs in MCP-server mode and is consumed by a standard MCP client.
6. **Ex06 — Agent over A2A.** The agent card served and discoverable; one task round-trips through the A2A surface.
7. **Ex07 — ACP editor integration.** The agent connected through ACP (Agent Client Protocol — Docker's documented editor integration, not IBM's Agent Communication Protocol) into an editor session.

**Exit condition:** examples 01–07 verified green plus the comparison cheat-sheet (`docs/notes/flavors.md`), then a deliberate pause with the owner before any real problem is chosen. Explicitly out of scope this phase: Gordon (`docker ai`), IBM's Agent Communication Protocol, CI-automated verification, remote git hosting.

## Agreed decisions

- **Local-first models.** Everything defaults to free, local models served by the already-installed Ollama daemon at `localhost:11434` — zero cost, works offline, zero API keys. Default model `gemma4:latest` (fits this machine's RTX 4080 16 GB VRAM); `gpt-oss:latest` as the heavy local tool-calling alternative; `gemma4:26b` for spot checks only (it spills to CPU).
- **Cloud agentic default routed via the Ollama daemon.** Delegation-heavy examples default to `glm-5.3-flash:cloud`, reached through the local Ollama daemon, which proxies to Ollama Cloud using the owner's existing app sign-in — no API-key env vars are part of this phase. Cloud spend is bounded to tiny smoke checks unless explicitly instructed otherwise; each example README documents the one-line local↔cloud model swap.
- **Declarative YAML configs.** Agents are defined by YAML configs (HCL exists but YAML is chosen throughout), with named `models:` entries on the built-in `ollama` provider preferred over inline provider/model strings, so the model is swappable in one place.
- **Verification before commit.** Every example documents exactly one headless verification command (`--exec`) that must complete successfully on this machine before that example is committed — broken examples never land. Interactive TUI runs are documented as owner demos, not machine-verified, and tool-approval behavior is documented per example so scripted runs are reproducible.
- **One commit per example.** Git is local-first too: initialized with no remote; each example is committed at example granularity with a clear message, so the history itself narrates the learning path.
- **No secrets, ever.** Credential indirection happens through environment-variable expansion in configs and git-ignored local files.

## Repo conventions

- **Issue tracker:** local markdown under `.scratch/<feature-slug>/` with a `Status:` triage line near the top of each issue — see `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
- **Domain docs:** `GLOSSARY.md` and `docs/adr/` are created lazily, only when terms or decisions actually resolve — see `docs/agents/domain.md`.
- **Ignore rules:** build artifacts (`node_modules/`, `dist/`) and local env files (`.env*`) are never committed (`.env.example` deliberately stays shareable), while the `.scratch/` issue tracker stays tracked.
- **Cross-cutting notes:** `docs/notes/` holds phase notes that outlive a single example — currently [`run-modes.md`](docs/notes/run-modes.md), the verified guide to every way of running a Docker Agent (TUI, headless `--exec`, stdin, `--json`, `--dry-run`, config discovery, safety modes, isolation, and the five `serve` surfaces).

## Prerequisites (recorded so failures are diagnosable in minutes)

- Docker Desktop running: Docker 29.8.2, Compose v5.6.0, `docker agent` v1.145.0
- Ollama v0.40.5 daemon running — and app signed in for the cloud path
- Models already present locally: `gemma4:latest`, `glm-5.3-flash:cloud`
- Node v24 + npm 11 (for the TypeScript MCP-server example); Python 3.11 (bonus only)

*Status: bring-up (01) and Ex01 (02) done and verified — Ex01's headless run exits 0 on local `gemma4:latest` and the one-time cloud smoke routed through the local daemon. Work continues with ticket 03 (`ex02-mcp-catalog-tool`).*
