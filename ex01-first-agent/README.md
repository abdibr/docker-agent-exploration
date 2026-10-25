# Ex01 — your first agent, no glue code

The smallest working Docker Agent example: one declarative YAML file defines the model,
the agent, and its toolsets — and that file alone runs the agent, interactively or
headless. No wrapper scripts, no client code; the config is the whole program.

## Prerequisite

The **Ollama daemon must be running** (`ollama serve` or the desktop app) for any run of
this example — local *and* cloud. The built-in `ollama` provider talks to the
OpenAI-compatible `/v1` endpoint at `localhost:11434` with no API key. For the optional
cloud smoke test the Ollama app must also be **signed in** — the same daemon proxies
`:cloud` models to Ollama Cloud with the app's account. Verify with `ollama list`: you
should see `gemma4:latest` (and `glm-5.3-flash:cloud`).

## What it teaches

- A **named models entry** on the built-in `ollama` provider (`provider: ollama`,
  `model: gemma4:latest`), referenced by the agent as `model: gemma4_local` — the model
  is swappable in exactly one place (see *Local ↔ cloud swap* below).
- Three built-in **toolsets** attached declaratively: `filesystem` (here sandboxed with
  `allow_list: ["."]` so the agent can only touch its working directory), `shell`, and
  `think`.
- The **headless verification template** every later example in this repo reuses:
  `docker agent run <config> --exec "<task>" --safety <level>` exits 0 on completeness
  and prints the full transcript (tool calls + final answer) to stdout, so a scripted
  run is itself the test.
## Run it (TUI — owner demo)

```powershell
cd ex01-first-agent
docker agent run .\agent.yaml
```

## The verification template (headless — machine-verified)

This is the example's **one** machine-verification command — every later example in this
repo reuses exactly this shape. From this directory:

```powershell
docker agent run .\agent.yaml --exec 'Read agent.yaml in the current directory using your filesystem tools. Then answer with exactly two lines. Line 1: the provider and the model name you find under models. Line 2: the three toolset types listed for this agent.' --safety restricted
```

**Why this task:** the answer lives entirely in the file the agent must read, so exit 0
plus the correct two lines (`ollama gemma4:latest` / `filesystem shell think`) is
unambiguous, repeatable proof that the model and the toolsets work end to end —
read-only, deterministic, leaves no scratch files.

**Observed when verified (2026-10-19, `docker agent` v1.145.0):** exit 0; the transcript
shows a visible `read_file` call on `agent.yaml` — including a useful self-correction:
the agent's first call sent `limit: 0`, received the clear tool error
`invalid limit 0: limit must be >= 1`, and retried with a valid limit before answering.

**Tool approvals:** `--safety restricted` is the fail-closed unattended profile — safe
calls (like this read-only filesystem access) are auto-approved, anything else is
denied, and no human is prompted mid-run. `--yolo` / `--safety autonomous` auto-approve
everything and stay reserved for deliberate one-shot commands.

> **For CI, exit 0 is not enough.** A denied tool call still exits 0 — the denial only
> shows up in the transcript (`Tool 'write_file' is denied by the restricted safety
> mode…`). Assert on the answer content, not the exit code. Full details, plus every
> other run surface (stdin, `--json`, config discovery, sandbox/worktree isolation, the
> five `serve` surfaces): [`docs/notes/run-modes.md`](../docs/notes/run-modes.md).

## Local ↔ cloud swap (one line)

The config stays identical except one line in the named models entry:

```yaml
models:
  gemma4_local:
    provider: ollama
    model: gemma4:latest          # ← swap to: glm-5.3-flash:cloud (same daemon proxies to Ollama Cloud)
```

**Verified (one-time routing smoke — the ticket's pre-approved cloud check, not the
example's verification command):** with `model: glm-5.3-flash:cloud`, a minimal
`--exec 'Reply with the single word: pong'` run returned `pong` with exit 0 — the local
daemon routed the request to Ollama Cloud using the app's existing sign-in, with no
other config change. **Cost:** glm-5.3-flash pricing is roughly $0.15 per 1M input
tokens / $0.50 per 1M output tokens, so a small smoke round-trip costs well under one
cent. The committed config stays on the local model. (After a swap the key
`gemma4_local` is cosmetic — it still refers to whatever model the line above it names.)

## Gotchas

- `read_file` with `limit: 0` fails (`invalid limit 0: limit must be >= 1`); use
  `limit >= 1` or omit the parameter. Small models may trip on this first — the error
  message is clear enough that gemma4 self-corrected on its own.
- gemma4 reasons **inline** (native chain-of-thought) and rarely calls the `think`
  tool; the `think` toolset stays useful for models without native reasoning.
- Under `--safety restricted`, anything the task does not strictly need may be
  auto-denied in unattended runs — that is correct behavior; design verification tasks
  to be read-only and narrowly worded so a small model's tool-calling stays reliable,
  and check the daemon first (`ollama list`) if a run misbehaves.
