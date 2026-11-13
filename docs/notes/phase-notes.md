# Docker Agent exploration — phase notes (cross-cutting findings)

**Scope:** what the whole sequence taught, not what one example taught. Each example
README owns its per-example gotchas; [run-modes.md](run-modes.md) owns the run
surfaces; [flavors.md](flavors.md) owns the per-flavor decisions. This file is the
layer between them: findings that span examples, each one citing which example(s) it
came from. Finalized at phase exit — ticket
[`09-flavors-cheatsheet`](../../.scratch/docker-agent-exploration/issues/09-flavors-cheatsheet.md).

**Evidence window:** 2026-10-17 (repo bring-up) through 2026-11-13 (phase exit);
`docker agent` v1.145.0 (2026-10 era examples) and v1.153.0 (2026-11-13 examples);
Windows 11 + PowerShell 5.1, Docker Engine 29.8.2→29.9.3, Ollama v0.40.5 at
`localhost:11434` serving `gemma4:latest` (9.6 GB) throughout. Every quote below is
from a recorded, machine-verified run unless explicitly marked otherwise.

**Contents:**

1. [One model daemon, shared contention — wall-clock numbers only compare when runs don't overlap](#1-one-model-daemon-shared-contention--wall-clock-numbers-only-compare-when-runs-dont-overlap)
2. [The CLI moved mid-phase (v1.145.0 → v1.153.0) — shapes mostly stable](#2-the-cli-moved-mid-phase-v11450--v11530--shapes-mostly-stable)
3. [Safety modes behave per-flavor — and shaped every example's template](#3-safety-modes-behave-per-flavor--and-shaped-every-examples-template)
4. [Exit 0 is not success — the discipline earned in every example](#4-exit-0-is-not-success--the-discipline-earned-in-every-example)
5. [Windows + PowerShell 5.1: two recurring gotchas](#5-windows--powershell-51-two-recurring-gotchas)
6. [The serve port map — and which flags each surface accepts](#6-the-serve-port-map--and-which-flags-each-surface-accepts)
7. [The verification-template evolution — one command to per-example probes](#7-the-verification-template-evolution--one-command-to-per-example-probes)

---

## 1. One model daemon, shared contention — wall-clock numbers only compare when runs don't overlap

Every example in this repo shares exactly one Ollama daemon and one GPU with
`gemma4:latest` resident. The wall-clock numbers the examples recorded were *all taken
on this one machine*, and they vary by an order of magnitude in ways that have nothing
to do with the flavor being tested:

- [Ex06](../../ex06-a2a/README.md) **A2A round trips: 331 ms / 496 ms** — warm daemon,
  nothing else running, one tiny model turn.
- [Ex05](../../ex05-agent-as-mcp-server/README.md) **~20 s per `tools/call`** — same
  class of task, with the README's own caveat: *"first-ever call may add model load
  time"*.
- [Ex04](../../ex04-sub-agents/README.md)'s **local-gemma4 rehearsal** of the same
  delegation task *"correctly, if verbosely, taking several minutes of wall time
  versus about a minute on cloud"* — recorded in its swap-section tradeoff.
- [Ex03](../../ex03-mcp-custom-server/README.md) *"runs finish in under a minute"*;
  [Ex07](../../ex07-acp-editor/README.md) *"local models can stream ~1 min of thought
  before answering"* (its probe budgeted 300 s for the prompt for exactly this reason).

The pattern: a warm resident model is fast (sub-second protocol overhead, tens of
seconds per model turn); a cold load, a longer thought-stream, or **another local run
overlapping in time all serialize on the same daemon/GPU** and inflate every affected
run's wall time. Overlapping `--exec` runs (and the notes' serve probes) are queued
behind each other — nothing fails, everything just gets slower, which is easy to
misread as a regression mid-exploration.

**Rules the phase settled on:** treat timings as magnitude evidence, never regression
signals; compare numbers only between runs whose daemon state was comparable; and give
verification scripts generous, local-model-aware timeouts (Ex07's 60 s handshake /
300 s prompt budget is the pattern). A phase-exit re-run of the Ex01 spot check with
nothing else running completed in under a minute — recorded in the
[ticket](../../.scratch/docker-agent-exploration/issues/09-flavors-cheatsheet.md).

## 2. The CLI moved mid-phase (v1.145.0 → v1.153.0) — shapes mostly stable

On 2026-11-13 Docker Desktop auto-updated the `docker agent` CLI plugin from
**v1.145.0** to **v1.153.0** mid-phase (commit `8f0eb5c05f878baaf32215dadd0652654081f4eb`;
captured in the exploration notes' `cli-facts.md`). Every serve process from that day
self-reports its version in its protocol surface — MCP `serverInfo`, the A2A card's
`version` field, ACP `agentInfo` — so evidence is version-attributable per claim.

What got re-validated as **unchanged** on the new version, same day: the Ex03 toolset
expansion (`debug toolsets` → 11 tools incl. `echo`), Ex04's `transfer_task` signature
`{agent, task, expected_output}`, the Ex05 MCP handshake and tool shape, and dry-run
behavior. The core YAML-config contract (Docker Agent Configuration schema v16) held.

What observably **moved** between the versions — the finding that shaped Ex05–Ex07:

- MCP `initialize` no longer advertises the `logging:{}` capability — only
  `tools:{listChanged:true}` ([Ex05](../../ex05-agent-as-mcp-server/README.md); its
  probe deliberately asserts `serverInfo`, not assumed capabilities).
- ACP `session/update` notifications grew an **envelope** (`params.update.{…}` in
  v1.153.0 vs the flat `params.sessionUpdate` of v1.145.0) plus new update kinds
  (`config_option_update`, `current_mode_update`) — [Ex07's](../../ex07-acp-editor/README.md)
  red→green story: the reply `pong` was on the wire while the probe read the wrong
  shape, so the shipped probe tolerates both envelopes.
- The A2A card gained `capabilities.pushNotifications:false` between v1.145.0 and
  v1.153.0 ([Ex06](../../ex06-a2a/README.md)) — its instruction: script against field
  *presence and meaning*, not an exact card snapshot.

**Discipline this earned:** assert the version the surface self-reports (do not assume
a capabilities set); when a probe fails to read data that is demonstrably on the wire,
suspect the shape, not the server — capture the raw bytes before "fixing" anything
(Ex07's `capture-acp-shape.mjs` recorded the verbatim envelope before the collector
was patched).

## 3. Safety modes behave per-flavor — and shaped every example's template

`--safety restricted` is the fail-closed unattended profile: it auto-approves
provably-safe calls, denies everything else, and never prompts. What "provably safe"
means turned out to be **per-flavor**, and each example's verification template was
chosen accordingly — checked empirically before committing, not assumed:

- **File reads are safe; writes are not.** [Ex01](../../ex01-first-agent/README.md)'s
  read-only task runs unattended under `restricted`; a `write_file` call under it gets
  `Tool 'write_file' is denied by the restricted safety mode: the call is not
  classified safe, and the mode's fallback denies instead of asking for confirmation.`
  (also [run-modes.md](run-modes.md) §11, observed per mode on this machine).
- **MCP calls — catalog or custom — are not on the safe list.**
  [Ex02](../../ex02-mcp-catalog-tool/README.md) (catalog `search`) and
  [Ex03](../../ex03-mcp-custom-server/README.md) (containerized `echo`) both proved the
  identical denial text on identical tasks under `restricted`, so their templates run
  `--safety autonomous` — *deliberate one-shots whose blast radius was read first*.
- **Delegation IS classified safe.** [Ex04](../../ex04-sub-agents/README.md) ran the
  identical task on a free local-gemma4 rehearsal under `restricted` before spending
  its one cloud run: both `transfer_task` calls auto-approved — the *opposite* of
  Ex02's catalog tool — so its template keeps `restricted`.
- **Serving defaults to restricted, and that is only safe because the served configs
  declare no toolsets.** The serve banner `Tool safety policy: restricted (source:
  serve default)` was observed live by both the [Ex05](../../ex05-agent-as-mcp-server/README.md)
  and [Ex06](../../ex06-a2a/README.md) probes; a served agent with toolsets would
  inherit the same fail-closed denial behavior the `run` examples document.
- **ACP negotiates safety as session data, not a launch flag.**
  [Ex07's](../../ex07-acp-editor/README.md) probe observed a cagent `configOptions`
  tool-safety select (`default|strict|balanced|restricted|autonomous`) arrive in the
  session — the editor can switch it mid-session; `serve acp` accepts no `--safety`
  at launch.
- **`balanced` without a human present is the worst choice, in both directions:**
  with no approver, a pending call surfaces as `The user rejected the tool call.`
  ([Ex02](../../ex02-mcp-catalog-tool/README.md) and run-modes §11 — observed).

Unattended-verification rule the phase converged on: `restricted` when the task's
calls are safe-classified (Ex01, Ex04), `autonomous` one-shots when the point of the
example is a call that is not (Ex02, Ex03) — never `balanced` unattended.

## 4. Exit 0 is not success — the discipline earned in every example

The finding that changed how everything in this repo is judged: a headless `--exec`
run exits **0 even when the task failed** — the denial/failure only shows up in the
transcript text. Observed failure shapes, per example ([run-modes.md](run-modes.md) §9
holds the original table and the CI snippet):

- [Ex01](../../ex01-first-agent/README.md) proved the baseline: a `write_file` denied
  under `restricted` still exits 0; a small model denied repeatedly looped
  (`detected 5 consecutive identical calls…`) and *that* run, too, exited 0; and
  gemma4 answered `WROTE` after the write was refused — never trust the model's
  narrative, assert on the side effect.
- [Ex02](../../ex02-mcp-catalog-tool/README.md) added the second variant: a failed
  *tool* call (network-dependent search) also exits 0 — the model honestly reports it
  could not search, exit 0.
- [Ex03](../../ex03-mcp-custom-server/README.md) added the third, nastiest variant: a
  **missing image** exits 0 — `debug toolsets` quietly lists no `echo`, the headless
  run prints a toolset-failure banner + `EOF` handshake error, and gemma4 even claimed
  *"I executed the echo tool"* while the framework had rejected the call. Two
  countermeasures shipped from this: `docker agent debug toolsets` as the **model-free
  gate** before any run (green means the exact expected tool count), and judging tool
  usage by the `response →` transcript lines, not by the model's reasoning.
- [Ex04](../../ex04-sub-agents/README.md) applied the rule to delegation: its proof is
  the two `Calling transfer_task(` blocks, the two `transfer_task response →` lines,
  and both sub-agent outputs verbatim in the final answer.
- [Ex05](../../ex05-agent-as-mcp-server/README.md)–[Ex07](../../ex07-acp-editor/README.md)
  changed the shape of the proof: serve surfaces have no grep-able transcript answer,
  so their zero-dependency probes **assert the protocol surface itself** (handshake
  fields, task state, artifact text) — which makes the probe's exit code trustworthy
  *by construction*; [Ex06's](../../ex06-a2a/README.md) probe even proves the serve
  port re-binds after teardown instead of trusting the kill.

The one-sentence form of the rule (run-modes §9): **exit 0 means "the agent finished",
not "the task succeeded"** — assert on transcript content, protocol evidence, or side
effects; when a single command is the whole test (Ex01's template), both halves must
hold: exit 0 *and* the correct answer lines. The phase-exit spot check recorded in the
[ticket](../../.scratch/docker-agent-exploration/issues/09-flavors-cheatsheet.md)
followed exactly this discipline.

## 5. Windows + PowerShell 5.1: two recurring gotchas

**Quoting and console shape** (recipes in the notes' `cli-facts.md`; hit by Ex02,
worked around everywhere after):

- **The first positional argument is the config, not the message.**
  `docker agent run .\agent.yaml "task"` — the config file *first*; a message in the
  config slot dies with `could not parse reference: …` because a non-path argument is
  parsed as an OCI registry reference ([Ex01](../../ex01-first-agent/README.md) /
  run-modes §10).
- **PowerShell 5.1 mangles embedded double quotes inside `--exec` text** — a quoted
  phrase arrives as several separate user turns ([Ex02
  discovered](../../ex02-mcp-catalog-tool/README.md) it; every later template either
  worded its task without embedded quotes ([Ex04](../../ex04-sub-agents/README.md))
  or quotes the constraint). PS 5.1 also turns `docker agent` stderr progress text
  into `NativeCommandError` — judge by content, capture with `2>&1` or via a `.cmd`
  launcher.
- **Long local runs exceed tool timeouts.** The working recipe (used by Ex03/Ex04
  verification): a `.cmd` launcher file redirecting output, started hidden
  (`Start-Process cmd.exe '/c run.cmd > out.txt 2>&1' -WindowStyle Hidden`, then poll
  the file).
- **Node's `child_process.spawn('docker', […])` bypasses shell quoting entirely** —
  which is why every serve probe (Ex05–Ex07) drives its surface that way.

**Process-tree cleanup on Windows** (Ex05–Ex07 all hit it; Ex06 turned it into an
assertion):

- `docker agent serve <mode>` spawns a **child `docker-agent.exe` that holds the
  listener** — killing the `docker`/`cmd` wrapper alone orphans the port (observed on
  the A2A probe port and Ex05's HTTP variant). Cleanup must be
  `taskkill /pid <pid> /T /F` (kill the tree), with the port owner via `netstat -ano`
  as fallback. Ex06's probe *asserts the port re-binds* before exiting 0, so a
  leaked tree fails the run instead of haunting the next one.

## 6. The serve port map — and which flags each surface accepts

The five serve surfaces, per [run-modes.md](run-modes.md) §15/§19 and the observed
banners/probes ([Ex05](../../ex05-agent-as-mcp-server/README.md),
[Ex06](../../ex06-a2a/README.md), [Ex07](../../ex07-acp-editor/README.md)):

| Surface | Default address | Transport notes | Flags that exist |
|---|---|---|---|
| `serve api` | `127.0.0.1:8080` | REST sessions (`POST /api/sessions`) | `--auth-token`, `--max-request-size` (413 above 1 MiB), `--session-workingdir-root`, `--pull-interval` (documented, unprobed) |
| `serve mcp` | stdio (no port) / `127.0.0.1:8081` with `--http` | NDJSON JSON-RPC on stdin/stdout by default; `--http` is **stateless** per MCP `2026-07-28` | `--http`, `--listen`, `--tool-name`/`-a` (single agent), `--safety`/`--auth-token` (**only** with `--http`); **no** `--session-db` — pin the global `--data-dir` instead (Ex05 probe's red lesson) |
| `serve a2a` | `127.0.0.1:8082` | HTTP JSON-RPC; card at `/.well-known/agent-card.json`; `/invoke` | `--listen` to move or rebind; startup banner defaults `restricted` |
| `serve chat` | `127.0.0.1:8083` | OpenAI-compatible chat completions | documented, unprobed |
| `serve acp` | stdio (no port, no flags) | JSON-RPC 2.0 NDJSON; launched by an editor as a child process | **none** of `--listen`/`--http`/`--safety`/`--auth` — mode and model are per-session `configOptions` |

Shared behavior observed on every probed surface: stdout carries protocol NDJSON only
(all logging on stderr — the split that makes SDK stdio clients work untouched), and
the serve process declares its tool-safety policy in a startup banner (`Tool safety
policy: restricted (source: serve default)`).

## 7. The verification-template evolution — one command to per-example probes

The spec's Testing Decisions made one headless command the single seam; the phase
evolved the template in four steps, each driven by an example that outgrew its
predecessor:

1. **Ex01 — the template is born:** `docker agent run .\agent.yaml --exec '<task>'
   --safety restricted`, with a task worded so the answer itself is the assertion
   (two exact lines: provider/model, toolset types). One command, external behavior
   only, exit 0 **plus** the two lines as the joint proof.
2. **Ex02/Ex03 — the pre-gates join the template.** Model-free validation before any
   run: `--dry-run` (config parses), `debug config` (canonical form), and — after
   Ex03's missing-image lesson — `debug toolsets` (the concrete tool list a config
   produces; it actually starts toolsets). Same headless shape; the safety mode
   switches per flavor (see §3).
3. **Ex04 — the approval check becomes a rehearsal.** Before spending its one
   pre-approved cloud run, a free local-gemma4 rehearsal under `restricted`
   established the tool-approval classification empirically; only then did the
   scripted verification run go to the cloud agentic model. Cost discipline and
   verification discipline converged here.
4. **Ex05–Ex07 — serve surfaces force probes:** no transcript to grep, so each example
   ships a **zero-dependency Node 24 probe** (stdlib only, no npm) that spawns the
   serve process exactly as a real client would, asserts the protocol surface
   (handshake fields → round-trip payload → task/artifact state), kills the process
   tree, and — Ex06's addition — *proves the port re-binds* before exiting 0. The
   probe's exit code is trustworthy by construction because it never trusts the serve
   process's own exit code.

What stayed constant across all seven examples (the spec's Testing Decisions, honored
end to end): exactly **one** machine-verification command per example, asserted on
external behavior only; no unit tests of YAML plumbing; the agent itself (or a minimal
direct protocol probe, Ex03) acts as the test client; local models by default and the
cloud path used once, deliberately ([Ex04](../../ex04-sub-agents/README.md), after
[Ex01](../../ex01-first-agent/README.md)'s one-time routing smoke).

---

## Where this leaves the repo

Example READMEs (what each flavor teaches, per-example gotchas), this file (what the
phase taught overall), [run-modes.md](run-modes.md) (how to run everything), and
[flavors.md](flavors.md) (which flavor, when) together close the spec's exit
condition: examples 01–07 verified green plus the cheat-sheet — then a deliberate
pause. **No real-problem work has been started; the next move belongs to the owner.**





