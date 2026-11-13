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
- **One commit per example.** Git is local-first: initialized and run with no remote for the whole exploration phase, each example committed at example granularity with a clear message, so the history itself narrates the learning path. The repo was published to GitHub after phase exit.
- **No secrets, ever.** Credential indirection happens through environment-variable expansion in configs and git-ignored local files.

## Using a different provider (Claude, OpenAI, Gemini, …)

Every example pins its model in exactly one place — a named entry in the config's `models:` block — so switching from the local Ollama daemon to a hosted provider is the same one-line swap you already have for local↔cloud, plus an API key in your environment (never in the repo):

```yaml
# ex01-first-agent/agent.yaml — before (built-in local provider, key-free):
models:
  gemma4_local:
    provider: ollama
    model: gemma4:latest

# after (Anthropic — same shape, different provider + model ID):
models:
  gemma4_local:
    provider: anthropic
    model: claude-sonnet-4-5
    # max_tokens: 64000   # optional
```

Or skip the named entry entirely and use the inline `provider/model` shorthand: `model: anthropic/claude-sonnet-4-5`.

- **Credentials live in your environment, not in YAML.** Each built-in provider reads a conventional env var and Docker Agent validates it at startup, failing fast and naming the missing variable. Set it before running: `export ANTHROPIC_API_KEY=sk-ant-…` (POSIX) or `$env:ANTHROPIC_API_KEY = "sk-ant-…"` (PowerShell). Anthropic → `ANTHROPIC_API_KEY`, OpenAI → `OPENAI_API_KEY`, Gemini → `GOOGLE_API_KEY` or `GEMINI_API_KEY`. Override the variable name per model with `token_key:` — note its value is the *name* of the env var, which is exactly why keys never need to enter a config file.
- **Other providers beyond the big three.** Popular aliases include `amazon-bedrock` (Claude via AWS), `openrouter`, `mistral` (`MISTRAL_API_KEY`), `deepseek` (`DEEPSEEK_API_KEY`), `github-copilot` (`GITHUB_TOKEN` with the `copilot` scope) — plus the key-free local options `dmr` (Docker Model Runner) and `ollama`. For a custom OpenAI-compatible endpoint, run the `docker agent setup` wizard or define a `providers:` block with `base_url:` + `token_key:`. Full table of aliases and keys: [Model Providers](https://docs.docker.com/ai/docker-agent/providers/overview/).
- **Mixed teams work.** Agents in one config may use different providers — e.g. Ex04's lead on Claude while planner and reviewer stay on `ollama`, to spend where reasoning pays off. Give each agent a `model:` pointing at a different `models:` entry.
- **Gotchas.** Model references are case-sensitive (`anthropic/claude-sonnet-4-5` ≠ `…/Claude-Sonnet-4-5`); hosted providers bill real money per call, which is why this repo stays local-first by default; and per-example *Local ↔ cloud swap* sections in each `ex*/README.md` follow the same `models:` block shown above.

## Repo conventions

- **Issue tracker:** local markdown under `.scratch/<feature-slug>/` with a `Status:` triage line near the top of each issue — see `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
- **Domain docs:** `GLOSSARY.md` and `docs/adr/` are created lazily, only when terms or decisions actually resolve — see `docs/agents/domain.md`.
- **Ignore rules:** build artifacts (`node_modules/`, `dist/`) and local env files (`.env*`) are never committed (`.env.example` deliberately stays shareable), while the `.scratch/` issue tracker stays tracked.
- **Interactive lessons:** [`lessons/`](lessons/index.html) holds a five-lesson HTML course (open `index.html` in a browser — standalone pages, no server needed) built directly on the verified examples: the mental model + flavor map, hands-on Ex01, the MCP flavors, sub-agents + the serve family, and the choose-your-flavor capstone. The teaching track's working state is tracked in [`MISSION.md`](MISSION.md), [`NOTES.md`](NOTES.md), [`RESOURCES.md`](RESOURCES.md), and [`learning-records/`](learning-records/), with quick-reference pages under [`reference/`](reference/).
- **Cross-cutting notes:** `docs/notes/` holds phase notes that outlive a single example — [`run-modes.md`](docs/notes/run-modes.md), the verified guide to every way of running a Docker Agent (TUI, headless `--exec`, stdin, `--json`, `--dry-run`, config discovery, safety modes, isolation, and the five `serve` surfaces); [`phase-notes.md`](docs/notes/phase-notes.md), the finalized cross-cutting findings of the exploration phase (model contention on the shared local daemon, the mid-phase CLI update, safety-mode behavior per flavor, exit-0-is-not-success, Windows/PowerShell 5.1 gotchas, the serve port map, the verification-template evolution); and [`flavors.md`](docs/notes/flavors.md), the comparison cheat-sheet deciding which interop flavor to reach for.

## Prerequisites (recorded so failures are diagnosable in minutes)

- Docker Desktop running: Docker 29.8.2, Compose v5.6.0, `docker agent` v1.145.0 at bring-up (Docker Desktop auto-updated the CLI plugin to v1.153.0 mid-phase on 2026-11-13; the Ex03–Ex07 surfaces were verified against v1.153.0 and behave identically for these configs)
- Ollama v0.40.5 daemon running — and app signed in for the cloud path
- Models already present locally: `gemma4:latest`, `glm-5.3-flash:cloud`
- Node v24 + npm 11 (for the TypeScript MCP-server example); Python 3.11 (bonus only)

*Status, phase exit (2026-11-13): the exploration is complete — all seven examples verified green and the cheat-sheet is committed. Ex01's headless run exits 0 on local `gemma4:latest` (re-verified at phase exit with a fresh spot check: exit 0 plus the two correct answer lines) and the one-time cloud smoke routed through the local daemon; Ex02 fires a real catalog-MCP web search (containerized `docker:duckduckgo`, no local install, no key) whose results shape the answer; Ex03 ships a hand-written TypeScript MCP server containerized via `command: docker` and proves the echo round trip; Ex04's one pre-approved cloud run shows two visible `transfer_task` delegations (planner + reviewer) whose outputs shape the answer; Ex05–Ex07 prove the `serve mcp` / `serve a2a` / `serve acp` surfaces with zero-dependency protocol probes, plus a live standard-client check (Claude Code `✓ Connected` against `serve mcp`). Version note: tickets 02–03 verified on `docker agent` v1.145.0 (2026-10-19/25); tickets 04–08 on v1.153.0 (2026-11-13, after Docker Desktop auto-updated the plugin mid-phase — core shapes re-validated, observable protocol deltas documented). Distilled deliverables: [`docs/notes/flavors.md`](docs/notes/flavors.md), the decision cheat-sheet across all six flavors with the adjacent documented-but-unbuilt surfaces, and [`docs/notes/phase-notes.md`](docs/notes/phase-notes.md), the finalized cross-cutting findings. Per the spec's exit condition the exploration now stops deliberately: examples 01–07 verified green plus the cheat-sheet — and no real-problem work has been started; the next move belongs to the owner.*
