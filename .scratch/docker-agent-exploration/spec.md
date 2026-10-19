Status: ready-for-agent

# Spec: Docker Agent & interop-flavors exploration

Derived from the grilling session with the repo owner; all decisions below were explicitly confirmed there.

## Problem Statement

The owner wants to learn Docker's declarative agent runtime (`docker agent`) and the agent-interop landscape around it — MCP (as client), MCP (as server), A2A, and ACP (Agent Client Protocol) — but is starting from a blank page: docs to read, syntax to learn, a local model server to wire up, and no runnable artifacts. Reading documentation without running things produces knowledge that evaporates; jumping into a real project before understanding the moving parts produces thrash.

## Solution

A sequence of seven small, self-contained, verified examples in this repo — one per flavor, ordered from "hello world" to multi-protocol interop — each declarative (YAML agent configs), each defaulting to free local models via the already-installed Ollama daemon, each verified by actually running it headless before it is committed. Learning is captured where it will be found later: a README per example, cross-cutting notes per phase, and a comparison cheat-sheet as the exit deliverable. Real problems are deliberately deferred until the sequence completes.

## User Stories

1. As an explorer, I want a git-initialized repo with a root README capturing the agreed decisions, so that the exploration has a durable, navigable home.
2. As an explorer, I want one numbered, self-contained example directory per flavor, so that I can work through the sequence without setup leaking between topics.
3. As an explorer, I want a first-agent example on the local `gemma4:latest` model, so that I confirm the `docker agent` ↔ host-Ollama toolchain end to end with zero cost and zero API keys.
4. As an explorer, I want a first-agent example that also exercises built-in toolsets (filesystem, shell, think), so that I see Docker Agent's "no glue code" philosophy before adding anything external.
5. As an explorer, I want every example README to show both an interactive (TUI) and a headless (`--exec`) command, so that I can choose between exploring by feel and running scripts.
6. As an explorer, I want every example verified by successfully running its headless command on this machine before it is committed, so that broken examples never land.
7. As an explorer, I want all examples defaulting to local models, so that the whole sequence is free and works offline.
8. As an explorer, I want delegation-heavy examples to default to the Ollama cloud model `glm-5.3-flash:cloud` (routed through my local Ollama daemon and existing app sign-in), so that stronger reasoning handles multi-agent tasks without managing API keys.
9. As an explorer, I want a documented one-line model swap in each README, so that I can toggle any example between local and cloud models based on cost/quality tradeoffs.
10. As an explorer, I want an MCP-client example using containerized MCP tools from Docker's MCP catalog, so that I learn the recommended tool path (isolated, containerized, no local installs).
11. As an explorer, I want to write my own MCP server in TypeScript, so that I understand the MCP contract from the server side, not just as a consumer.
12. As an explorer, I want that custom MCP server containerized and consumed by an agent, so that I see Docker's security/isolation story for external tools.
13. As an explorer, I want a native multi-agent example (`sub_agents`), so that I learn Docker Agent's built-in delegation without any protocol machinery.
14. As an explorer, I want an agent exposed as an MCP server, so that I can consume a Docker Agent from any MCP client and understand agent-as-tool integration.
15. As an explorer, I want an agent exposed over A2A, so that I learn Docker Agent's agent-to-agent protocol surface and how it differs from MCP.
16. As an explorer, I want an agent connected through ACP (Agent Client Protocol) to an editor, so that I see the editor-integration flavor of agent interop.
17. As an explorer, I want a comparison cheat-sheet produced at the end of the sequence, so that I can decide where each interop flavor belongs in real future projects.
18. As an explorer, I want the exit criteria stated in advance (all seven examples green + the cheat-sheet), so that the move to "real problems" is a deliberate checkpoint, not a drift.
19. As a future reader, I want each README to explain what the example teaches plus gotchas actually hit while building it, so that learnings survive long after the conversation that produced them.
20. As a future reader, I want cross-cutting findings collected as phase notes, so that per-example mechanics stay separate from cross-example insights.
21. As the implementing agent, I want exactly one documented headless verification command per example, so that I can verify any example non-interactively.
22. As the implementing agent, I want tool-approval behavior documented per example, so that scripted runs are reproducible (auto-approval only in deliberate one-shot commands).
23. As the implementing agent, I want no secrets ever committed — model/endpoint configuration via environment-variable indirection where needed — so that the repo stays share-safe.
24. As the implementing agent, I want cloud-model usage bounded to tiny smoke tests unless explicitly instructed otherwise, so that token spend stays negligible.
25. As the implementing agent, I want exploration work tracked under the repo's local issue-tracker convention, so that tickets, status, and comments have a canonical home.
26. As the implementing agent, I want environment prerequisites recorded (Ollama daemon running and signed in for cloud, Docker Desktop running, versions used), so that failures are diagnosable in minutes, not hours.
27. As an explorer, I want a recorded note on GPU/VRAM fit for the local models on this machine, so that I don't pick local models that spill to CPU.
28. As an explorer, I want each example scoped to hours, not days, so that the exploration keeps momentum.
29. As an explorer, I want stretch items (HTTP API server, OCI agent share/push, containerized-Ollama swap demo, a Python MCP-server bonus) documented but not built by default, so that scope discipline survives curiosity.
30. As an explorer, I want Gordon (`docker ai`) and IBM's Agent Communication Protocol explicitly excluded from this phase, so that nobody wanders into adjacent-but-unagreed territory.
31. As an MCP-client author in a future project, I want the agent-as-MCP-server example to be directly reusable scaffolding, so that the exploration pays forward into real integration work.
32. As an editor user, I want editor prerequisites and connection steps spelled out in the ACP example, so that I can reproduce it on my own setup.
33. As the repo owner, I want commits at example granularity with clear messages, so that the git history itself narrates the learning path.

## Implementation Decisions

- Runtime stack: Docker Desktop's bundled `docker agent` CLI (verified v1.145.0) with the Docker MCP Toolkit CLI available for catalog/gateway work; host Ollama install (v0.40.5, daemon listens on all interfaces and is reachable as `localhost:11434`). Docker Model Runner is not enabled in this phase.
- Models: a single Ollama endpoint serves both local and cloud models. Local default `gemma4:latest` (9.6 GB, fits the RTX 4080's 16 GB VRAM); heavy local alternative `gpt-oss:latest` (13 GB, fits) for local tool-calling comparison; `gemma4:26b` reserved for spot checks only (18 GB exceeds VRAM, spills to CPU). Agentic default `glm-5.3-flash:cloud`, reached through the local Ollama daemon, which proxies to Ollama Cloud using the owner's existing app sign-in — no API-key env vars are part of this phase.
- Configuration style: declarative YAML agent configs (HCL exists but YAML is chosen throughout). Named `models:` entries referencing Docker Agent's built-in `ollama` provider are preferred over inline provider/model strings, so each example is swappable in one place; every README documents the swap line.
- Example sequence — one numbered, self-contained directory per example: first agent with built-in toolsets; MCP client consuming a containerized MCP tool from Docker's MCP catalog; hand-written MCP server in TypeScript, containerized and consumed by an agent (Python bonus optional and deferred); native multi-agent team via sub-agent delegation; agent surfaced as an MCP server; agent surfaced over A2A; agent connected via ACP to an editor. ACP here means Docker Agent's documented Agent Client Protocol / editor integration, not IBM's Agent Communication Protocol.
- Verification-first: the implementing agent runs each example headless and confirms observable success before committing; TUI runs are the owner's hands-on demos, documented but not machine-verified.
- Learning artifacts: a README per example (what it teaches, TUI + headless commands, model-swap line, gotchas hit while building), phase notes for cross-example findings, and a comparison cheat-sheet as the capstone deliverable.
- Repo process: git initialized locally with no remote; commits at example granularity; exploration work tracked via this repo's local markdown issue tracker convention with the standard triage-label vocabulary; domain glossary and ADRs are created lazily only when terms/decisions actually resolve, per this repo's convention.
- Secrets: none committed; any credential indirection goes through environment-variable expansion in configs and git-ignored local files.

## Testing Decisions

- Good test = external behavior only. We test what an observer can see from outside the process: the headless agent run completes its stated task; external tools were actually invoked (catalog MCP tool, custom MCP server); delegation visibly occurred (sub-agent contribution in the transcript); the exposed agent responds through its protocol surface (MCP server mode, A2A endpoint, ACP client connection). We never test internal YAML structure or config plumbing as such — the config is an artifact; its execution is the test.
- Seam: exactly one — the Docker Agent CLI boundary (headless `--exec` invocation of an agent config with a task string, plus, for the protocol-flavored examples, the protocol surface that boundary exposes). This is the highest available seam and was confirmed by the owner twice during the grilling session (definition-of-done decision, then shared-understanding sign-off). No lower-level seams: no unit tests of YAML, no SDK-level tests of the custom MCP server's internals beyond behavior observed through the agent or a direct protocol probe.
- Modules under test: each example's runnable config, plus the server code it ships (the TypeScript MCP server in the custom-server example). The agent itself acts as the test client wherever possible; for the custom MCP server, a minimal direct protocol probe may supplement the agent-mediated check.
- Verification template: the headless verification pattern established while building the first example becomes the template every later example reuses — there is no prior art in this greenfield repo.
- Cost discipline: one tiny cloud smoke check (a single-message round-trip through the Ollama Cloud path) is pre-approved to validate the sign-in routing; everything else runs on local models by default.

## Out of Scope

- Gordon (`docker ai`) — Docker's separate built-in assistant.
- IBM's Agent Communication Protocol (BeeAI lineage) — distinct from the ACP specified here.
- Any real application problem — explicitly deferred until the exploration phase exits.
- CI/automation of verification; remote git hosting; Docker Hub account setup; OCI agent push/pull (stretch, only on request).
- Enabling Docker Model Runner; containerizing Ollama (stretch demo only); downloading any new models.
- Production concerns: security-hardening review, sandbox-mode evaluation beyond a passing note, cross-machine reproducibility, multi-user use.

## Further Notes

- Environment facts this spec rests on (re-verified during grilling): Docker 29.8.2, Compose v5.6.0, `docker agent` v1.145.0, Ollama v0.40.5 with daemon running, RTX 4080 16 GB VRAM, Node v24.12.0 + npm 11.6.2 (basis for choosing TypeScript for the custom MCP server), Python 3.11.5 (bonus only), no cloud API keys on the machine and none required, git identity configured, `gemma4:latest` and `glm-5.3-flash:cloud` already present locally.
- The Ollama daemon must be running (and app-signed-in for the cloud model) for any example run; each example README opens with this prerequisite.
- Cloud pricing note for the record: `glm-5.3-flash` bills roughly $0.15 input / $0.50 output per 1M tokens; a typical example run costs a fraction of a cent.
- Exit condition for the whole phase: examples 01–07 verified green plus the comparison cheat-sheet committed, then a deliberate pause with the owner before any real problem is chosen.