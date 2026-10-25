# Ex02 — MCP client via Docker catalog tool

The Ex01 agent pattern, now reaching outside itself: one new toolset entry adds an MCP
server **by reference** to Docker's MCP catalog (`docker:duckduckgo` web search). Docker
pulls and containerizes that server through the MCP gateway — no local MCP install, no
API key, and the YAML config alone is still the whole program.

## Prerequisite

Docker Desktop with the MCP plugin (already on this machine: `docker agent toolsets`
lists an `mcp_catalog` toolkit), **and the Ollama daemon running** (`ollama serve` or the
desktop app) for any run of this example — it serves `gemma4:latest` to
`localhost:11434`; the cloud swap additionally needs the Ollama app signed in.
The catalog entry the config resolves to lives in Docker's MCP catalog snapshot:
`docker:duckduckgo` → "Private Web Search" (community-maintained, not affiliated with
DuckDuckGo), image `mcp/duckduckgo@sha256:5617c4c60f48f47556c0735de7a73f6abd731c132c65ec8c720b511819c9f88f`
with egress restricted to
`html.duckduckgo.com:443` (observed at this machine's 2026-10-25 snapshot). The first MCP
call starts the MCP gateway and auto-pulls that image; nothing needs to be installed or
configured locally. Browse the catalog with `docker mcp catalog ls`. DuckDuckGo was
chosen over the catalog's brave/tavily/exa search entries precisely because it needs
**no API key** — the no-secrets phase means no credential indirection anywhere in this
example.

## What it teaches

- A catalog MCP toolset added purely by reference: `type: mcp`, `ref: docker:duckduckgo`,
  plus an optional `tools:` allowlist. No server code, no
  config keys, no local process — the `ref` + catalog snapshot is the whole server
  description.
- **Offline config validation without a model:** `docker agent debug toolsets .\agent.yaml`
  expands the config to the 11 concrete tools the model would see (9 filesystem + `think`
  + the catalog `search` tool) — a fast way to prove the ref resolved to the right server.
- The **isolation story**: the gateway runs the pinned image as a one-off container with
  restricted egress (`allowHosts: html.duckduckgo.com:443`); after a run there are no
  visible image or container remnants in `docker images` / `docker ps -a` (observed) —
  pull, run and teardown are all gateway-managed.
- A **`tools:` whitelist beats no whitelist**: without it every server tool is exposed;
  a one-entry allowlist (`search` only) keeps the tool surface — and the tool
  descriptions crowding the context — to exactly what the task needs. Relevant for
  small local models.
- The headless verification template from Ex01, **with a changed safety mode** — this
  example's tool call is not "safe" under the restricted profile, so its one verification
  command runs `--safety autonomous` instead (see *Tool approvals* below).

## Run it (TUI — owner demo)

```powershell
cd ex02-mcp-catalog-tool
docker agent run .\agent.yaml
```

Interactive runs sit behind the default tool-approval profile: the first `search` call
pops an approval prompt you can accept, which is the friendliest way to watch the
gateway + container come to life. This is a demo surface, not the machine-verified one.

## The verification template (headless — machine-verified)

Same shape as Ex01, different safety mode. From this directory:

```powershell
docker agent run .\agent.yaml --exec 'Use your web-search MCP tool: search the web for Docker MCP Gateway GitHub repository. Then answer with exactly two lines. Line 1: the URL of the official GitHub repository from your search results. Line 2: the exact title shown for the top result.' --safety autonomous
```

**Why this task:** the two answer lines exist only if the search tool actually returned
results — the URL and title must be quoted from a live result, and a small model cannot
reliably guess the exact title offline. The transcript doubles as proof the tool fired.

**Observed when verified (2026-10-25, `docker agent` v1.145.0, the committed 11-tool
config):** exit 0; the transcript shows the real call `search(max_results: 1, query:
"Docker MCP Gateway GitHub repository", region: "wt-wt")`, the tool response
`Found 1 search results: 1. Docker MCP Plugin and Docker MCP Gateway - GitHub / URL:
https://github.com/docker/mcp-gateway /…`, and the final answer repeating exactly those
two lines — the search results demonstrably shaped the answer. First call took ~40s
(gateway start + image pull); reruns finish in well under a minute.

**Tool approvals — why autonomous, not restricted.** Under `--safety restricted` the
same task was tried first and the catalog call was auto-denied in the transcript:

> `Tool 'search' is denied by the restricted safety mode: the call is not classified
> safe, and the mode's fallback denies instead of asking for confirmation.`

That is correct fail-closed behavior — no approver exists in an unattended run, and a web
search is not on the provably-safe list. `--safety autonomous` auto-approves everything
and stays reserved for deliberate one-shot commands like this template. `balanced` would
be worse than restricted here: with no human present the pending call surfaces as
"The user rejected the tool call."

> **For CI, exit 0 is not enough** — in both directions: an unusable-but-approved tool
> call exits 0 here just like Ex01's denied calls exit 0. Assert on the transcript and
> the answer content, never the exit code. Full details, plus every other run surface
> (stdin, `--json`, config discovery, serve surfaces): [`docs/notes/run-modes.md`](../docs/notes/run-modes.md).

## Local ↔ cloud swap (one line)

Identical to Ex01 — swap one line in the named models entry:

```yaml
models:
  gemma4_local:
    provider: ollama
    model: gemma4:latest          # ← swap to: glm-5.3-flash:cloud (same daemon proxies to Ollama Cloud)
```

The MCP toolset is model-agnostic: the same catalog ref works with the cloud model, which
is the better tool-caller for multi-step tool-calling chains. (Ex01 covered the
one-time cloud routing smoke; it needs no repeat here, and the committed config stays on
local gemma4.)

## Gotchas

- **`--safety restricted` auto-denies MCP catalog calls in unattended runs** (observed
  message above). For scripted runs of this example use `--safety autonomous`; check the
  transcript for the `search` call and its results rather than trusting exit code.
- **PowerShell 5.1 mangles embedded double quotes in `--exec` strings.** A quoted phrase
  inside the task text arrived at the agent as several separate messages — the model
  saw `"Docker"`, `"MCP."`, `"Gateway."`, `"GitHub."` as user turns before the real task.
  Avoid embedded double quotes in `--exec` text (worded without quotes, the task
  arrived intact), or run from PowerShell 7.
- The catalog snapshot fixes the tool **schemas**: `search` takes `query`,
  `max_results` (1–20, default 10), optional `region`; gemma4 chose `max_results: 1`
  unprompted to "focus on the top result" — harmless here, but remember it when asserting
  on specific snippets. Also note the config `ref` carries **no version** — what Docker
  resolves is the catalog snapshot's image pin (digest quoted above), and a newer
  catalog release can move that pin (and the tool schemas with it).
- A failed tool call does not fail the run: after the restricted denial the transcript
  showed `search response → "Tool 'search' is denied…"` and gemma4 correctly answered
  that it could not search (the config's honesty instruction paid off) — with exit 0.
- Docker MCP is **outbound-web dependent**: the container egresses to
  `html.duckduckgo.com:443` at call time; sandboxed or offline environments will fail
  inside the tool call, again with exit 0.
- Keyed catalog entries (brave, tavily, exa, …) need config-backed secrets wired through
  `docker mcp` — deliberately out of scope until the phase's no-secrets rule is lifted;
  this example stays entirely key-free.
