# Docker Agent run modes — a working guide

**Scope:** every way to run a Docker Agent from this repo, using `ex01-first-agent/agent.yaml`
as the worked example. Cross-cutting note: later examples (Ex02–Ex07) reuse the same
run surfaces, so the reference tables here stay valid for the whole sequence.

**Verified on:** 2026-10-20 — Docker Engine 29.8.2, `docker agent` v1.145.0, Ollama v0.40.5
(daemon running), Windows 11 + PowerShell 5.1. Every command and behaviour below was
executed on this machine; observed output is quoted where it matters.

**Status of the repo's own contract:** Ex01's headless run is the verification template
for all later examples (see `.scratch/docker-agent-exploration/issues/02-ex01-first-agent.md`).
This guide documents the *run surfaces* around that template — including one finding that
changes how the template must be judged in CI (see [§9](#9-exit-codes-what-actually-signals-failure)).

---

## Contents

1. [Prerequisites](#1-prerequisites)
2. [The example config](#2-the-example-config)
3. [Run modes at a glance](#3-run-modes-at-a-glance)
4. [Mode 1 — Interactive TUI](#4-mode-1--interactive-tui)
5. [Mode 2 — Headless `--exec`](#5-mode-2--headless---exec)
6. [Mode 3 — Message via stdin](#6-mode-3--message-via-stdin)
7. [Mode 4 — Structured JSON output](#7-mode-4--structured-json-output)
8. [Mode 5: dry-run (config check without model)](#8-mode-5-dry-run-config-check-without-model)
9. [Exit codes: what actually signals failure](#9-exit-codes-what-actually-signals-failure)
10. [Choosing a config: explicit vs discovered](#10-choosing-a-config-explicit-vs-discovered)
11. [Safety modes and tool approval](#11-safety-modes-and-tool-approval)
12. [Isolation: sandbox, cloud, worktree, remote](#12-isolation-sandbox-cloud-worktree-remote)
13. [Models and providers](#13-models-and-providers)
14. [Toolsets and tools](#14-toolsets-and-tools)
15. [Serving an agent (API, chat, MCP, A2A, ACP)](#15-serving-an-agent-api-chat-mcp-a2a-acp)
16. [The rest of the CLI](#16-the-rest-of-the-cli)
17. [Known blockers on this machine](#17-known-blockers-on-this-machine)
18. [Gotchas](#18-gotchas)
19. [Quick reference](#19-quick-reference)

---

## 1. Prerequisites

The **Ollama daemon must be running** for every run in this repo — local *and* cloud. The
built-in `ollama` provider talks to the OpenAI-compatible `/v1` endpoint at
`localhost:11434` and needs no API key.

```powershell
ollama --version      # 0.40.5
ollama list           # must show gemma4:latest (and glm-5.3-flash:cloud for the cloud path)
```

For the cloud path the Ollama **app** must additionally be signed in — the same daemon
proxies `:cloud` models to Ollama Cloud using the app's account.

Docker must be running too. `docker agent doctor` is the one-shot health check, but note
it **exits non-zero on this machine** (Docker Model Runner is unreachable — see
[§17](#17-known-blockers-on-this-machine)). That non-zero exit is *not* a blocker for
the Ex01 config, which uses the local Ollama provider and never touches Model Runner.

---

## 2. The example config

`ex01-first-agent/agent.yaml` — the config is the whole program; no wrapper scripts, no
client code.

```yaml
models:
  gemma4_local:
    provider: ollama          # built-in provider -> host Ollama daemon
    model: gemma4:latest      # ← THE SWAP POINT (local ↔ cloud)
agents:
  root:
    model: gemma4_local
    description: Ex01 first agent - smallest working Docker Agent
    instruction: |
      ...
    max_iterations: 20
    toolsets:
      - type: filesystem
        allow_list: [ "." ]   # agent may only touch its working directory
      - type: shell
      - type: think
```

Three things are worth noticing:

- A **named models entry** (`gemma4_local`) is referenced by the agent, so the model is
  swappable in exactly one place. After a swap the *key* is cosmetic — it names whatever
  model the line above it points at.
- `filesystem` is **sandboxed with `allow_list: ["."]`** — the agent can only reach its
  working directory.
- The file is schema-aware: line 1 pins the JSON schema, so editors validate it.

---

## 3. Run modes at a glance

| # | Mode | Command | Use it for | Needs a model? |
|---|------|---------|-----------|----------------|
| 1 | Interactive TUI | `docker agent run .\agent.yaml` | exploring by feel | yes |
| 2 | Headless | `docker agent run .\agent.yaml --exec "task" --safety restricted` | **the verification template** | yes |
| 3 | Stdin | `echo "task" \| docker agent run .\agent.yaml - --exec` | piping dynamic input | yes |
| 4 | JSON | `... --exec --json` | machine parsing, CI | yes |
| 5 | Dry run | `docker agent run .\agent.yaml --dry-run` | config sanity check | no |

Modes 1–5 are combinable: `--exec` + `--json` + `--safety restricted` is the CI shape.

---

## 4. Mode 1 — Interactive TUI

```powershell
cd ex01-first-agent
docker agent run .\agent.yaml
```

Full-screen terminal UI. The owner demo for this repo. Useful TUI flags:

| Flag | Effect |
|------|--------|
| `--agent-picker` | full-screen chooser; `"defaults"` offers built-in agents plus `~/.agents` configs |
| `--lean` | simplified TUI, minimal chrome |
| `--sidebar` / `--sidebar=false` | toggle the sidebar (default on) |
| `--theme auto` | match terminal light/dark |
| `--disable-commands /cost,/eval,/model` | trim the command palette |

To pick a non-default agent from a multi-agent config: `--agent root`.
To continue a past conversation: `--session -1` (last session) or an explicit session ID.

---

## 5. Mode 2 — Headless `--exec`

**This is the repo's verification template** — the single seam every later example reuses.

```powershell
docker agent run .\agent.yaml --exec "Read agent.yaml in the current directory using your filesystem tools. Then answer with exactly two lines. Line 1: the provider and the model name you find under models. Line 2: the three toolset types listed for this agent." --safety restricted
```

Observed (2026-10-20): exit 0, transcript shows a visible `read_file` call, final answer
`ollama gemma4:latest` / `filesystem shell think`.

Other headless flags:

| Flag | Effect |
|------|--------|
| `--hide-tool-calls` | suppress tool-call lines (cleaner stdout) |
| `--hide-tool-results` | suppress tool output bodies |
| `--json` | structured event stream (Mode 4) |
| `--prompt-file <f>` | append file contents to the prompt (repeatable) |
| `--attach <image>` | attach an image to the message |
| `--env-from-file <f>` | load env vars from a file |
| `--record` | record the session to a cassette + generate a TUI e2e test |
| `--fake <cassette>` | replay AI responses from a cassette (testing) |
| `--fake-stream [ms]` | simulate streaming delay |
| `--code-mode-tools` | expose one tool that calls other tools via JavaScript |
| `--flavor <name>` | apply a YAML patch from the config's `flavors:` section (repeatable) |
| `--hook-*` | `pre-tool-use`, `post-tool-use`, `session-start`, `session-end`, `stop`, `on-user-input` |
| `--on-event <type>=<cmd>` | run a shell command on an event (`*=<cmd>` for any) |
| `--working-dir <dir>` | set the working directory for tools and relative paths |
| `--model provider/model` | override the agent's model (repeatable, `[agent=]provider/model`) |
| `--otel` | OpenTelemetry tracing (global flag) |
| `-d/--debug --log-file <f>` | debug logging to a file |

---

## 6. Mode 3 — Message via stdin

Use `-` as the config slot to read the message from stdin:

```powershell
echo "Reply with the single word: pong" | docker agent run .\agent.yaml - --exec --safety restricted
```

Observed: exit 0, answer `pong`. This is the right shape for dynamic input (a variable,
a file, another program's output) where shell quoting would be fragile.

> **Note:** `-` occupies the *config* position. The config is still `.\agent.yaml`; the
> dash is the stdin marker.

---

## 7. Mode 4 — Structured JSON output

```powershell
docker agent run .\agent.yaml --exec "task" --safety restricted --json
```

**Newline-delimited JSON** — one JSON object per line, not a single JSON array. Observed
event types for a run that calls one tool:

| `type` | Meaning |
|--------|---------|
| `team_info` | agents in the team, provider/model per agent, `current_agent` |
| `agent_info` | resolved agent + model (`ollama/gemma4:latest`) |
| `toolset_info` | `available_tools` count per toolset (11 for Ex01) |
| `mcp_init_started` / `mcp_init_finished` | MCP init lifecycle |
| `user_message` | the prompt, with `session_id` and `session_position` |
| `stream_started` / `stream_stopped` | turn boundaries; `reason`, `finish_reason` |
| `partial_tool_call` | streaming fragment of a tool call |
| `tool_call` | complete tool invocation (name + arguments) |
| `tool_call_response` | the tool's result — **and the place a denial surfaces** |
| `agent_choice_reasoning` | incremental reasoning chunks |
| `agent_choice` | **the final answer**, in `content` |
| `token_usage` | input/output tokens, context length, cost |
| `message_added` | message persisted |
| `hook_started` / `hook_finished` | hook lifecycle |

The two fields CI actually wants:

```json
{"type":"agent_choice","content":"pong","session_id":"…","message_id":"…"}
{"type":"token_usage","usage":{"input_tokens":1590,"output_tokens":2,"cost":0,…}}
```

Note `agent_choice_reasoning` fired 152 times for a trivial prompt — filter by `type`
rather than grepping raw lines, and never treat the whole stream as one JSON document.

---

## 8. Mode 5: dry-run (config check without model)

```powershell
docker agent run .\agent.yaml --dry-run
```

Observed: `Dry run mode enabled. Agent initialized but will not execute.` — exit 0, no
model call, no side effects. This is the cheapest way to answer "is my YAML valid and
does it resolve?".

Two companion debug commands are more informative than `--dry-run` alone:

```powershell
docker agent debug config .\agent.yaml    # canonical form of the config
docker agent debug toolsets .\agent.yaml  # the concrete tools a toolset expands to
docker agent debug skills .\agent.yaml    # skills of an agent
```

`docker agent debug toolsets .\agent.yaml` printed **11 tools** for Ex01 — the expansion of
`filesystem` (9), `shell` (1) and `think` (1). It is the fastest way to see exactly what an
agent can do before letting it act.

---

## 9. Exit codes: what actually signals failure

**This is the finding most likely to bite in CI.**

`--exec` exited **0 in every safety mode — including when the tool call was denied**:

| Scenario | Exit code | Side effect |
|----------|-----------|-------------|
| Read-only task, `--safety restricted` | 0 | — |
| Write denied, `--safety strict` | **0** | file **not** created |
| Write denied, `--safety restricted` | **0** | file **not** created |
| Write approved, `--safety autonomous` / `--yolo` | 0 | file created |

The denial is visible in the *text*, not in the exit code:

- `--safety strict` (and the `--exec` default) → `The user rejected the tool call.`
- `--safety restricted` → `Tool 'write_file' is denied by the restricted safety mode: the call is not classified safe, and the mode's fallback denies instead of asking for confirmation.`

Non-zero exits **do** occur for setup failures — a bad config path
(`could not parse reference: …`), an unreachable model provider, a missing model.

### CI rule

> **Exit 0 means "the agent finished", not "the task succeeded."**

For unattended verification, assert on the *content* of the run, not the exit code:

```powershell
# Fail the pipeline if a tool was denied
$out = docker agent run .\agent.yaml --exec "task" --safety restricted --json 2>&1
if ($out -match 'denied by the restricted safety mode|The user rejected the tool call') {
    Write-Error "tool call was denied"; exit 1
}
if ($LASTEXITCODE -ne 0) { Write-Error "agent run failed"; exit 1 }
# and assert the expected answer, e.g. type=agent_choice content
```

The same caveat applies to the Ex01 verification template itself: exit 0 **plus** the
correct two lines is the proof — **both** halves are required, which is why the template's
task is worded so the answer is unambiguous.

Two further failure shapes worth knowing:

- **Degenerate tool loop.** When a tool is denied repeatedly, a small model can retry the
  same call forever. Observed: `Agent terminated: detected 5 consecutive identical calls
  to write_file. This indicates a degenerate loop where the model is not making progress.`
  The run still exits 0 — another reason to assert on content.
- **The model may lie about the outcome.** Asked to write a file and then reply `WROTE`,
  gemma4 produced the word `WROTE` *after* the write was denied. Never infer success from
  the model's own claim — assert on the side effect (does the file exist?) instead.

---

## 10. Choosing a config: explicit vs discovered

Three ways to name the config, in order of explicitness:

**a) Explicit path (recommended, and what this repo uses).**

```powershell
docker agent run .\agent.yaml --exec "task"
```

**b) Project-config discovery.** Run with no config argument and Docker Agent looks for a
project config in the working directory. Verified names:

| File | Recognised? | Observed output |
|------|-------------|-----------------|
| `docker-agent.yaml` | ✅ | `Using project config: docker-agent.yaml` |
| `docker-agent.yml` | ✅ | `Using project config: docker-agent.yml` |
| `docker-agent.hcl` | ✅ | `Using project config: docker-agent.hcl` |
| `agent.yaml` | ❌ | **not discovered** — falls through to the built-in default agent |

> **This project's file is `agent.yaml`, which is *not* a discovered name.** Discovery only
> applies to `docker-agent.{yaml,yml,hcl}`. If automatic discovery is wanted here, rename
> the file to `docker-agent.yaml` — or keep the explicit path, which is unambiguous.
>
> The `.hcl` variant is discovered but the Ex01 file is YAML; HCL is the alternative
> config syntax, not an interchangeable extension of the same content.

**c) Built-in / default agent.** `docker agent run` with no config and no discoverable
project config falls back to a built-in agent on the `dmr` provider (`ai/qwen3:latest`).
That path is **blocked on this machine** — Docker Model Runner is unreachable, so the run
fails with `Docker Model Runner is not running. Please start it and try again.`
(observed, exit 1). `docker agent run coder` selects a built-in agent by name; same blocker.

**Registry references.** A non-path argument is treated as an OCI registry reference
(`myorg/agent:tag`) — which is why a bare message in the config slot fails with
`could not parse reference: …`.

---

## 11. Safety modes and tool approval

`--safety <mode>` controls who approves tool calls:

| Mode | Behaviour | Use for |
|------|-----------|---------|
| `strict` | ask for **everything** | interactive exploration |
| `balanced` | auto-approve safe calls, ask for the rest | interactive with a light touch |
| `restricted` | auto-approve safe calls, **deny** the rest | **unattended / CI** |
| `autonomous` | approve everything | deliberate one-shot commands |
| *(default)* | — | in `--exec` this behaves like `strict`; with no approver present, calls come back `The user rejected the tool call.` |

`--yolo` is an alias for `--safety autonomous`.

Observed distinctions on a `write_file` call:

- `restricted` → `Tool 'write_file' is denied by the restricted safety mode: the call is not classified safe, and the mode's fallback denies instead of asking for confirmation.`
- `strict` → `The user rejected the tool call.` (nothing to approve with, so it is refused)
- `autonomous` / `--yolo` → `File written successfully: _probe.txt (5 bytes)`

Note `read_file` was auto-approved in every mode — reads are classified safe, so the Ex01
verification task runs unattended without a flag.

**Choosing one:** use `restricted` for CI (fail-closed, never prompts); use `balanced` when
a human is watching; reserve `autonomous`/`--yolo` for one-shot commands whose blast radius
you have thought about — it grants the agent `write_file`, `edit_file`, `shell` and
`remove_directory` over the whole `allow_list` with no gate.

---

## 12. Isolation: sandbox, cloud, worktree, remote

Beyond `allow_list` on the filesystem toolset, Docker Agent offers four stronger
isolation boundaries.

| Flag | Effect | Status here |
|------|--------|-------------|
| `--sandbox` | run the agent inside a Docker sandbox | ❌ **blocked** — needs the Docker Sandboxes CLI |
| `--cloud` | cloud sandbox (implies `--sandbox`); no host files or credentials uploaded | ❌ **blocked** (same cause) |
| `--worktree[=name]` | fresh git worktree of the working directory; changes isolated from your checkout | ✅ **works** |
| `--remote <addr>` | use a remote runtime | not exercised |

**`--sandbox` / `--cloud` on this machine:** `--sandbox --dry-run` failed with
`--sandbox requires a working Docker Sandboxes CLI: exit status 1` and
`"docker sandbox" is deprecated and has been removed.` The `sbx` CLI is not installed
(`where sbx` → not found). `--sbx` (default `true`) prefers the `sbx` backend; the old
`docker sandbox` path is gone. Install the Docker Sandboxes CLI to unlock these.

**`--worktree` is the practical isolation tool available today** — verified with
`docker agent run .\agent.yaml --worktree --dry-run` → exit 0. The agent's edits land in a
throwaway worktree, so your checkout stays clean. Related flags: `--worktree-base <ref>`
(branch from a ref instead of HEAD) and `--worktree-pr <number|url>` (continue a GitHub PR
branch; needs the `gh` CLI).

Other sandbox knobs: `--template` (OCI image or cloud template, default
`docker/docker-agent-sbx-templates:latest`), `--sandbox-kit` / `--kit` / `--kit-arg`
(sandbox mixins), `--no-kit` (skip staging skills/prompt files into the sandbox),
`--sandbox-ttl` (cloud sandbox lifetime, default 1h).

---

## 13. Models and providers

```powershell
docker agent models          # models available from the local default provider
docker agent models --all    # every provider the CLI knows
```

`docker agent models` on this machine lists only `dmr / ai/qwen3:latest` (the Docker Model
Runner default) — because Model Runner is unreachable, that default is not actually usable.
`--all` reveals the full catalogue: `dmr`, `amazon-bedrock`, plus the usual cloud
providers (`anthropic`, `openai`, `chatgpt`, `google`, `mistral`, `openrouter`, `groq`,
`huggingface`, …).

**The Ex01 config bypasses all of that** by naming a provider explicitly:

```yaml
models:
  gemma4_local:
    provider: ollama     # built-in provider → host Ollama daemon, no API key
    model: gemma4:latest
```

**The one-line local ↔ cloud swap:**

```yaml
model: glm-5.3-flash:cloud   # ← swap; the same daemon proxies to Ollama Cloud
```

Verified once (the repo's single pre-approved cloud smoke): `--exec 'Reply with the single
word: pong'` → exit 0, `pong`. The local daemon routed it to Ollama Cloud using the app's
existing sign-in — no other config change. **Cost:** `glm-5.3-flash` ≈ $0.15 / 1M input
tokens and $0.50 / 1M output tokens, so a smoke round-trip costs well under one cent.
The committed config stays on the local model.

To change a model without touching the file: `--model provider/model`, e.g.
`--model ollama/gpt-oss:latest`.

`docker agent setup` walks through provider selection interactively (built-in provider,
local model, custom endpoint, or Claude Code).

---

## 14. Toolsets and tools

```powershell
docker agent toolsets    # 27 built-in toolset types
```

The catalogue includes: `a2a`, `api`, `background_agents`, `background_jobs`,
`environment`, `fetch`, `file`, `filesystem`, `git`, `lsp`, `mcp`, `mcp_catalog`, `memory`,
`model_picker`, `open_url`, `openapi`, `plan`, `rag`, `scheduler`, `script`,
`session_context`, `shell`, `tasks`, `think`, `todo`, `user_prompt`, `webhook`.

Ex01 uses three of them — `filesystem`, `shell`, `think` — expanding to **11 concrete
tools**:

- `filesystem` → `read_file`, `write_file`, `edit_file`, `list_directory`,
  `create_directory`, `remove_directory`, `directory_tree`, `read_multiple_files`,
  `search_files_content` (9)
- `shell` → `shell` (1)
- `think` → `think` (1)

Notes on the Windows `shell` tool (it runs **PowerShell**, not POSIX):

- Chain with `;` — `&&` is a **parse error** on PowerShell 5.1.
- No POSIX utilities: use `Select-String` (not `grep`), `Select-Object -First N`
  (not `head`/`tail`), `Measure-Object -Line` (not `wc -l`), `Get-Content` (not `cat`),
  `Expand-Archive` (not `gunzip`/`tar`).
- `ls -la` fails — use `ls` or `Get-ChildItem`.
- The `environment` toolset reports the OS and resolved shell (read-only) — useful when
  unsure which dialect you are in.

`read_file` gotcha: `limit: 0` is invalid (`invalid limit 0: limit must be >= 1`) — use
`limit >= 1` or omit the parameter. gemma4 tripped over this on its first call in the
original verification and self-corrected.

---

## 15. Serving an agent (API, chat, MCP, A2A, ACP)

`docker agent serve` exposes the same config over five surfaces. These are the entry
points for Ex05 (agent as MCP server), Ex06 (A2A) and Ex07 (ACP).

```powershell
docker agent serve api  .\agent.yaml    # HTTP API          default 127.0.0.1:8080
docker agent serve mcp  .\agent.yaml    # MCP server        default 127.0.0.1:8081 (stdio by default)
docker agent serve a2a  .\agent.yaml    # A2A server        default 127.0.0.1:8082
docker agent serve chat .\agent.yaml    # OpenAI-compatible chat completions   default 127.0.0.1:8083
docker agent serve acp  .\agent.yaml    # ACP server        (stdio)
```

`serve mcp` uses **stdio** by default — add `--http` for streaming HTTP transport, and
`--listen 127.0.0.1:9090` to change the address. `serve acp` has no `--listen`; it is
stdio-based and is meant to be launched by an editor.

`serve api` extras worth knowing: `--auth-token <t>` (bearer token; empty = no auth),
`--max-request-size` (default 1 MiB, oversized bodies get HTTP 413),
`--session-workingdir-root <dir>` (restrict the `working_dir` of sessions created via
`POST /api/sessions` — recommended for multi-user deployments), and `--pull-interval`
(auto-pull an OCI reference every N minutes).

---

## 16. The rest of the CLI

**Core**

| Command | Purpose |
|---------|---------|
| `docker agent getting-started` | interactive hands-on tour |
| `docker agent run` | run an agent (all modes above) |
| `docker agent setup` | interactive model/provider setup |
| `docker agent share push\|pull` | push/pull an agent to/from an OCI registry |

**Diagnose**

| Command | Purpose |
|---------|---------|
| `docker agent doctor` | model + credential health (exits non-zero while DMR is down) |
| `docker agent models [--all]` | list models |
| `docker agent toolsets` | list built-in toolset types |

**Advanced**

| Command | Purpose |
|---------|---------|
| `docker agent new [description]` | scaffold a new agent config (`--model provider/model`) |
| `docker agent debug config\|toolsets\|skills\|auth\|oauth\|title` | inspect a config or its expansion |
| `docker agent eval <config> [eval-dir]` | run evaluations; `--baseline <run.json>` exits non-zero on regression; `--repeat N` builds a baseline; `--judge-model`; `--regression-tolerance`; `--concurrency`; `--base-image`; `--agent-image` |
| `docker agent sandbox` | manage docker-agent sandbox settings |
| `docker agent serve` | the five server surfaces |
| `docker agent sessions diff` | compare two recorded sessions |
| `docker agent plans` | manage shared plans |
| `docker agent alias` | manage aliases |
| `docker agent board` | orchestrate agents on a Kanban board |

**Global flags** (accepted by every subcommand): `--config-dir` (default
`~/.config/cagent`), `--data-dir` (default `~/.cagent`), `--cache-dir`, `-d/--debug`
(+ `--log-file`, default `~/.cagent/cagent.debug.log`), `-o/--otel`.

---

## 17. Known blockers on this machine

| Blocker | Symptom | Fix |
|---------|---------|-----|
| **Docker Model Runner unreachable** | `docker agent doctor` exits non-zero: `Status: unreachable: querying DMR models endpoint: … dial unix /var/run/docker.sock: connect: A socket operation encountered a dead network.` Built-in/default agents fail with `Docker Model Runner is not running. Please start it and try again.` | `docker desktop enable model-runner` (or Settings → AI → Enable Docker Model Runner) |
| **`sbx` CLI not installed** | `--sandbox` / `--cloud` fail: `--sandbox requires a working Docker Sandboxes CLI: exit status 1`; `"docker sandbox" is deprecated and has been removed.` | install the Docker Sandboxes CLI; use `--worktree` meanwhile |
| **`agent.yaml` is not a discovered config name** | bare `docker agent run` ignores it and falls through to the built-in default agent (which then fails on DMR) | rename to `docker-agent.yaml`, or keep passing the path explicitly |

None of the three blocks the Ex01 verification template: it names the `ollama` provider
explicitly and is invoked with an explicit config path.

---

## 18. Gotchas

- **The first positional argument is the config, not the message.** `docker agent run "hello
  world" --exec` fails with `could not parse reference: … hello world` — it tries to parse
  the message as a registry reference. Put the file first, then the message:
  `docker agent run .\agent.yaml "hello world" --exec`. Or pipe the message in:
  `echo "hello world" | docker agent run .\agent.yaml - --exec`.
- **Exit 0 ≠ success.** See [§9](#9-exit-codes-what-actually-signals-failure). Assert on
  the answer content and on the side effects, not on the exit code.
- **`--json` is NDJSON**, one object per line — parse line by line. Expect ~150
  `agent_choice_reasoning` events per trivial prompt.
- **`agent.yaml` is not auto-discovered** — only `docker-agent.{yaml,yml,hcl}` are.
- **`--safety restricted` denies writes.** Ex01's verification task is read-only on
  purpose, so it passes unattended; a task that must write needs `autonomous`/`--yolo`.
- **PowerShell 5.1 semantics** in the `shell` toolset: `;` not `&&`, and no POSIX utilities.
- **`read_file` with `limit: 0`** errors out — use `limit >= 1` or omit it.
- **gemma4 reasons inline** and rarely calls the `think` tool; `think` remains useful for
  models without native chain-of-thought.
- **Small models can loop** on a denied tool (`detected 5 consecutive identical calls`).
  Denial in the transcript is the real signal.

---

## 19. Quick reference

```powershell
# --- interactive ---
docker agent run .\agent.yaml                                  # TUI
docker agent run .\agent.yaml --agent root                     # pick an agent
docker agent run .\agent.yaml --session -1                     # resume last session

# --- the verification template (headless) ---
docker agent run .\agent.yaml --exec "task" --safety restricted

# --- message from stdin ---
echo "task" | docker agent run .\agent.yaml - --exec --safety restricted

# --- machine-readable ---
docker agent run .\agent.yaml --exec "task" --safety restricted --json
docker agent run .\agent.yaml --exec "task" --safety restricted --json --hide-tool-calls

# --- config checks (no model needed) ---
docker agent run .\agent.yaml --dry-run
docker agent debug toolsets .\agent.yaml
docker agent debug config  .\agent.yaml

# --- isolation ---
docker agent run .\agent.yaml --worktree --exec "task" --safety restricted
docker agent run .\agent.yaml --sandbox  --exec "task" --safety restricted   # needs sbx
docker agent run .\agent.yaml --cloud    --exec "task" --safety restricted   # needs sbx

# --- serving ---
docker agent serve api  .\agent.yaml    # :8080
docker agent serve mcp  .\agent.yaml    # :8081 (stdio default, --http for HTTP)
docker agent serve a2a  .\agent.yaml    # :8082
docker agent serve chat .\agent.yaml    # :8083
docker agent serve acp  .\agent.yaml    # stdio

# --- diagnosis ---
docker agent doctor
docker agent models --all
docker agent toolsets
```

**The one command to remember:**

```powershell
docker agent run .\agent.yaml --exec "Read agent.yaml in the current directory using your filesystem tools. Then answer with exactly two lines. Line 1: the provider and the model name you find under models. Line 2: the three toolset types listed for this agent." --safety restricted
```

Exit 0 **and** the two correct lines. Both halves — see [§9](#9-exit-codes-what-actually-signals-failure).

