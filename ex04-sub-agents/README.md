# Ex04 — a native sub-agent team, no protocol machinery

One YAML file builds a **three-agent team**: a lead agent plus a planner and a reviewer,
wired with Docker Agent's built-in `sub_agents:` mechanism. Declaring sub-agents gives
the lead a dedicated `transfer_task` tool — and nothing else changes: still no server
code, no protocols, no glue; the config is the whole program. This example defaults to
the Ollama Cloud agentic model (`glm-5.3-flash:cloud`) because delegation choreography
is a multi-step reasoning job.

## Prerequisite

The **Ollama daemon must be running** (`ollama serve` or the desktop app) and — *for
this example's default path* — the Ollama app must also be **signed in**: the same
local daemon (localhost:11434) proxies `:cloud` models to Ollama Cloud using the app's
account, with no API key configured anywhere. Verify with `ollama list`: the entry
`glm-5.3-flash:cloud` must be present. The local swap below removes the sign-in
requirement. The Ollama provider needs no API key in either direction.

## What it teaches

- The **`sub_agents:` mechanism** is an array of *names of sibling `agents:` entries*
  (it also accepts OCI refs). Listing sub-agents is what hands the lead its
  `transfer_task` tool — `docker agent debug toolsets .\agent.yaml` proves the split
  model-free: the lead gets `think` + `transfer_task`; the planner and reviewer get
  `think` only. Delegation is **leader-only**; a sub-agent would need its own
  `sub_agents:` entry to delegate further (nested hierarchies).
- **When delegation beats plain tools.** Use a tool when one agent can do one
  well-described operation; delegate when work splits into *roles*. Each sub-agent
  gets its own chat, its own instruction, its own tool surface, and — crucially for
  the reviewer — a **fresh view that contains only what the lead forwarded** (here:
  the plan, not the lead's framing of the task). Sub-agent output arrives back as the
  `transfer_task` tool result, so the lead stays in control and composes the final
  answer. That context isolation, tailored instructions per role, and a transcript
  that shows *exactly who produced what* is what plain tools cannot give you.
- **Delegation is not a conversation handoff**: the sub-agent's answer becomes data
  for the lead (tool result), rather than switching which agent talks to the user.
- **Per-role cost control**: each agent has its own `max_iterations` (lead 12, subs 6
  here) bounding runaway loops, and a one-user-task run fans out into several model
  chats — one lead turn set plus one full nested chat per sub-agent — so token spend
  multiplies. That is the reason this example defaults to the cheap agentic cloud
  model instead of a small local one (see the swap section for the tradeoff).
- Delegation is **visibly identifiable in a plain-text headless transcript**: each
  `Calling transfer_task(...)` block and each `transfer_task response →` line is
  machine-checkable evidence (see the verification template).

## Run it (TUI — owner demo)

```powershell
cd ex04-sub-agents
docker agent run .\agent.yaml
```

Ask in the TUI for a task like the verification one below and watch the transcript:
the lead plans, delegates to the planner, forwards the plan to the reviewer, then
answers with both results. No approval prompts interrupt it (delegation is classified
safe by the restricted profile too — see the tool-approval note below).

## The verification template (headless — machine-verified)

Same shape as every example in this repo. From this directory:

```powershell
docker agent run .\agent.yaml --exec 'Delegate immediately. First use transfer_task once to send the planner sub-agent this task: produce a numbered three-step plan for safely renaming the git branch main to trunk in a git repository. Then use transfer_task once to send the reviewer sub-agent the plan you received and ask it to approve the plan or flag a missing step. Then answer with exactly two labeled parts. Part 1: the numbered plan you received from the planner. Part 2: the reviewer verdict you received.' --safety restricted
```

**Why this task:** it forces the full delegation choreography — two *distinct*
`transfer_task` calls (planner, then reviewer), with the reviewer call embedding the
plan the lead received — and the two-labeled-parts answer makes the sub-agent outputs
machine-identifiable in the final text. Exit 0 plus that transcript is proof the
native multi-agent mechanism works end to end through the committed config.

**Observed when verified (2026-11-13, `docker agent` v1.153.0):** exit 0, wall time
about a minute. The transcript shows, in order:

1. `Calling transfer_task(` with `agent: "planner"`, `expected_output: "A numbered
   list of exactly three steps…"`, `task: "Produce a numbered three-step plan for
   safely renaming the git branch main to trunk in a git repository."` — the tool
   signature is exactly `{agent, task, expected_output}`.
2. `transfer_task response → "1. Confirm the working tree is clean and no work is
   lost (`git status`)…"` — the planner's full nested chat (it even used its own
   `think` tool) returned as the tool result.
3. `Calling transfer_task(` with `agent: "reviewer"` and a `task:` that embeds the
   planner's plan verbatim — the planner→reviewer dataflow is visible in the call.
4. `transfer_task response → "Revise\nThe plan omits updating references to `main` —
   branch protection rules, CI workflow triggers, and open pull requests…"`.
5. Final answer: `Part 1:` the planner's three steps verbatim, `Part 2:` the
   reviewer's `Revise` verdict verbatim — both sub-agent outputs shaped the answer.

**Tool approvals:** under `--safety restricted` — the fail-closed unattended profile —
every `transfer_task` call was **auto-approved** (checked empirically with a rehearsal
run; zero denials or rejections in the transcript). This is the *opposite* of Ex02,
where the catalog MCP `search` call was denied under restricted: delegating to a
declared sub-agent is classified safe, while an arbitrary containerized MCP tool is
not. The one verification command therefore stays on the strict profile. Ex01's CI
rule still applies: judge the transcript, not just exit 0.

**Cloud cost of this run:** glm-5.3-flash bills roughly $0.15 per 1M input / $0.50 per
1M output tokens. The verification run is five short model chats with small prompts
and answers — transcript-level token volume is small, a fraction of a cent per run.
Repeated unattended runs multiply that fan-out, so keep tasks scoped.

## Local ↔ cloud swap (one line)

The committed config runs on the cloud agentic model by default. The swap goes the
other way here — to local `gemma4:latest` — by changing one line in the named models
entry:

```yaml
models:
  cloud_agentic:
    provider: ollama
    model: glm-5.3-flash:cloud     # ← swap to: gemma4:latest (same daemon, app sign-in not needed)
```

**The tradeoff:** `glm-5.3-flash:cloud` is a stronger reasoning model, and this
example's task is exactly the kind it buys you — multi-hop delegation choreography
(plan → forward → review → compose, each step dependent on the last) plus honest
formatting discipline across three role prompts. A small local model pays for the
free/offline run in route quality: gemma4 reasons inline at length before delegating
and can *fumble the choreography* — dropping a delegation, inventing the plan or the
verdict itself, or looping. For the record, the same verification task did complete
on local gemma4 in a rehearsal run on this machine (correctly, if verbosely, taking
several minutes of wall time versus about a minute on cloud) — use the local swap for
cheap iteration on the team shape, but expect the cloud model to handle delegation
more reliably. The key `cloud_agentic` is cosmetic after a swap — it still refers to
whatever model the line above it names.

## Gotchas

- **`transfer_task` is lead-only.** Sub-agents never get it unless they themselves
  declare `sub_agents:` (confirmed by `debug toolsets`: planner/reviewer expose
  `think` only). A sub-agent asked to delegate will not be able to.
- **`transfer_task` requires both `task` and `expected_output`** — the tool
  description the model sees demands it. Weak prompts may see the model invent an
  `expected_output`; harmless, but worth reading in the transcript.
- **Exit 0 ≠ success**, in both directions: a denied tool call still exits 0. Assert
  on the two `transfer_task` blocks, the two `transfer_task response →` lines, and
  the labeled parts of the answer. Cross-check the classification finding above if
  the CLI plugin updates — a future version could change what restricted approves.
- **PowerShell 5.1 mangles embedded double quotes in `--exec` text** (quoted words
  arrive as separate user turns — Ex02's proven gotcha). This template's task text is
  worded without quotes or apostrophes so the same string works from cmd.exe too.
- **Do not name a sub-agent like a built-in tool** (`think`, …) or duplicate an agent
  name — agent names feed the tool surface when the config is served.
- **Cost fan-out is easy to underestimate**: one task here becomes ~5 model chats
  (lead pre/post turns + a full nested chat per sub-agent). Keep sub-agent
  `max_iterations` small and tasks short on repeated runs.
- Sub-agent chats run with the sub-agent's own toolsets (both used `think` inside
  their nested chats on the verified run) — a sub-agent with write tools is a
  sub-agent that will use them; keep toolsets minimal per role.

