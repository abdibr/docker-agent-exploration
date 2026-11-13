# Ex03 — MCP from the server side: your own containerized TypeScript MCP server

The Ex02 agent consumed a server someone else wrote (`ref: docker:duckduckgo`). Ex03 flips
the seat: the repo owns the server. `server.ts` is a hand-written MCP server exposing one
deterministic `echo` tool, containerized with a 6-line Dockerfile, and wired into the agent
by command — the agent config itself spawns `docker run --rm -i mcp-ex03-echo:local` and
speaks MCP stdio over the container's stdin/stdout. No npm install, no tsc build, no MCP
SDK: the config plus the server file is the whole program.

## Prerequisite

The **Ollama daemon must be running** (`ollama serve` or the desktop app) for any run of
this example — the agent's model is `gemma4:latest` served at `localhost:11434`; the cloud
swap additionally needs the Ollama app signed in. Verify with `ollama list`.

**Build the tool image first** (from this directory) — every run spawns it:

```powershell
docker build -t mcp-ex03-echo:local .
```

That bakes `server.ts` into a `node:24-alpine` image (172 MB; Node v24.22.3 — the version
that executes a `.ts` file directly via Node 24 type stripping). Verified against
`docker agent` v1.153.0 (Docker Engine 29.9.3) on 2026-11-13. Building does **not** need a
running model or Ollama.

## What it teaches

- **MCP over stdio is newline-delimited JSON-RPC**, and that is learnable by writing one:
  the server handles `initialize` (echo back a `protocolVersion` + `serverInfo`),
  `notifications/initialized` (a notification — no response may be sent), `tools/list`,
  `tools/call`, and `ping`. That whole protocol surface is ~100 lines with no SDK — the
  parts libraries usually hide are handshake bookkeeping and the no-response rule for
  notifications.
- **The tool schema is a JSON Schema the server declares**, and it is the *entire* contract
  the model sees: `inputSchema: {message: string, required}` tells the framework which
  arguments to enforce, while the description text ("Echoes back the given message
  prefixed with ECHO:, plus the character count") is what actually steers the model's
  calling behavior. Write that description as if prompting the model — because it is one.
- **Transport follows consumption**: because the agent spawns the server as a child process
  (`command: docker`, `args: [run, --rm, -i, <image>]`), the wire is stdin/stdout (stdio
  transport), not a URL. stderr stays free for server logs — the probe below shows the
  server's `ready on stdio` banner there. Keep stdout strictly NDJSON: anything else
  pollutes the protocol stream.
- **The inline shape vs the named shape.** This example uses the inline toolset shape
  (`type: mcp` + `command:`/`args:` on the agent). An equivalent, also-verified-alternative
  (same `debug toolsets` output, proven during the exploration notes on this machine) is a
  top-level named block plus a reference:

  ```yaml
  mcps:
    echo-srv:
      command: docker
      args: [run, --rm, -i, mcp-ex03-echo:local]
  agents:
    root:
      toolsets:
        - type: mcp
          ref: echo-srv
  ```

  Inline is chosen here because it keeps one agent's wiring next to that agent; the named
  shape pays off once several agents share one server definition. There is no `image:`
  key, and no URL-style consumption for local servers — `docker run` in `command`/`args` *is*
  the containerization path.
- **Isolation and image lifecycle are yours here** (unlike Ex02's gateway-managed catalog
  image). You build and tag the image; the framework spawns `docker run --rm -i` for the
  MCP session; `--rm` means no leftover containers — observed: `docker ps -a` shows none
  after runs — and the image stays until you `docker rmi` it.
- **A `tools:` allowlist, like Ex02**: this server has one tool, and the config allows just
  that one (`tools: [echo]`) — the discipline that keeps the model's tool surface exactly
  what the task needs.
- **Zero-dependency TypeScript, deliberately.** Node 24 executes `.ts` directly when it
  uses only "erasable" syntax (type annotations, interfaces, `as`-casts), so the example
  ships a bare `server.ts` — no package.json, no npm layer, no supply-chain surface, one
  `COPY` in the Dockerfile. A package.json + `@modelcontextprotocol/sdk` build would buy a
  protocol library at the cost of an npm install layer; for a teaching-size server,
  shipping the protocol on ~100 readable lines won.

## Run it (TUI — owner demo)

```powershell
cd ex03-mcp-custom-server
docker agent run .\agent.yaml
```

Interactive runs sit behind the default tool-approval profile: the first `echo` call pops
an approval prompt you can accept — a nice way to watch the container being spawned per
session. This is a demo surface, not the machine-verified one.

## The verification template (headless — machine-verified)

Same shape as Ex01/Ex02, same safety mode as Ex02. From this directory:

```powershell
docker agent run .\agent.yaml --exec 'Use the echo tool from your custom MCP server to echo exactly this text: round trip check 42. Then answer with exactly two lines. Line 1: the exact text the echo tool returned. Line 2: the character count it reported.' --safety autonomous
```

**Why this task:** both answer lines can only come from the tool round trip — the `ECHO:`
prefix and the character count (`round trip check 42` = 19 chars) are computed *inside the
container* by the server. The transcript doubles as proof the containerized server was
spawned, handshaken, and called.

**Observed when verified (2026-11-13, docker agent v1.153.0):** exit 0; the transcript
shows the real call `Calling echo(message: "round trip check 42")`, the response
`echo response → "ECHO: round trip check 42 (19 chars)"`, and the final answer repeating
exactly those two lines (`ECHO: round trip check 42 (19 chars)` / `19 chars`) — the
containerized server's output demonstrably shaped the answer. Runs finish in under a
minute.

**Supplementary direct protocol probe (model-free).** The Testing Decisions allow a minimal
direct probe next to the agent-mediated check. The `mcp-probe-requests.ndjson` fixture
records a full MCP exchange; piped through the exact command the agent runs, the container
answers it with no model at all:

```powershell
cmd /c "type mcp-probe-requests.ndjson | docker run --rm -i mcp-ex03-echo:local"
```

→ three NDJSON responses: `initialize` (`serverInfo mcp-echo 1.0.0`), `tools/list` (the
`echo` tool with its schema), and `tools/call` → `{"text":"ECHO: hello from docker
(17 chars)"}`, `isError:false`.

**Tool approvals — why autonomous, not restricted.** Under `--safety restricted` the same
task was tried and the custom-server call was auto-denied in the transcript:

> `Tool 'echo' is denied by the restricted safety mode: the call is not classified safe,
> and the mode's fallback denies instead of asking for confirmation.`

Identical to Ex02's catalog verdict — *what* serves the tool (catalog gateway or your own
container) does not change the approval classification; MCP calls in general are not on
the provably-safe list. `--safety autonomous` auto-approves everything and stays reserved
for deliberate one-shot commands like this template.

> **For CI, exit 0 is not enough** — in *three* directions here: the restricted denial
> exits 0, a missing image exits 0 (see Gotchas), and a failed tool call exits 0. Assert
> on the transcript and the answer content, never the exit code. Full details, plus every
> other run surface (stdin, `--json`, config discovery, serve surfaces):
> [`docs/notes/run-modes.md`](../docs/notes/run-modes.md).

## Local ↔ cloud swap (one line)

Identical to Ex01/Ex02 — swap one line in the named models entry:

```yaml
models:
  gemma4_local:
    provider: ollama
    model: gemma4:latest          # ← swap to: glm-5.3-flash:cloud (same daemon proxies to Ollama Cloud)
```

The MCP toolset is model-agnostic: the containerized server is spawned the same way
regardless of which model drives the tool calls, and the cloud model is the better
tool-caller for multi-step chains. (Ex01 covered the one-time cloud routing smoke; it
needs no repeat here, and the committed config stays on local gemma4.)

## Gotchas

- **A missing image fails almost silently, and exits 0.** Before building, `debug toolsets`
  printed the usual filesystem/think tools with **no** `echo`, exit 0; a real headless run
  printed `⚠️ Some toolsets failed to initialize for agent 'root'` plus
  `mcp(stdio cmd=docker ...) start failed: failed to initialize MCP client: connection
  closed: calling "initialize": client is closing: EOF` (the container exits instantly, the
  MCP handshake reads EOF) — and still exited 0 while gemma4 answered honestly that the
  tool was unavailable. Always build first, and let
  `docker agent debug toolsets .\agent.yaml` be the model-free gate: green means
  **11 tools** for this config, with `+ echo - Echoes back the given message...` among them.
- **Small models can believe they called a missing tool.** In that red run, gemma4 reasoned
  *"I executed the echo tool"* even though the framework rejected the call — only the
  transcript line `echo response → "Tool 'echo' is not available..."` told the truth.
  Judge tool usage by the `response →` transcript lines, not by the model's narrative.
- **`--safety restricted` auto-denies custom-MCP calls in unattended runs** (observed quote
  above). For scripted runs of this example use `--safety autonomous`; check the transcript
  for the `echo` call and its `ECHO:` response rather than trusting exit code.
- **PowerShell 5.1 mangles embedded double quotes in `--exec` strings** (same as Ex02) —
  the template above is worded without them; this example was verified through PS 5.1.
- **The container is per-session and stderr is the log channel.** During a run you can see
  the short-lived container in `docker ps`; after it, nothing (`--rm`). The server's
  `ready on stdio` banner must go to stderr — putting such banners on stdout would corrupt
  the NDJSON stream and break the MCP client.
- **The red-run failure mode showed the default `resilient` lifecycle**: the agent starts
  degraded and the model loops on an unavailable tool rather than refusing to run. The
  schema offers a `lifecycle: {profile: strict}` knob (refuse-to-start when a toolset is
  unavailable) that this example deliberately leaves unverified.
