# Docker Agent Resources

## Knowledge

- [Official docs: Docker Agent (docs.docker.com/ai/cagent)](https://docs.docker.com/ai/cagent/)
  Product docs landing page: why agent teams, install (Docker Desktop 4.63+; called "cagent" on 4.49–4.62), YAML shapes, OCI sharing. Use for: authoritative definitions and current CLI behavior.
- [Getting-started quickstart](https://docs.docker.com/ai/docker-agent/getting-started/quickstart/) and [configuration reference](https://docs.docker.com/ai/docker-agent/configuration/overview/)
  First-agent walkthrough; full config keys. Use for: verifying YAML key names before they go into a lesson.
- [GitHub: docker/docker-agent](https://github.com/docker/docker-agent)
  The open-source runtime itself ("AI Agent Builder and Runtime by Docker Engineering", Apache-2.0; CLI plugin `docker agent`). Use for: schema, `examples/` directory, changelog, issue tracker.
- [Config schema JSON (agent-schema.json)](https://raw.githubusercontent.com/docker/docker-agent/main/agent-schema.json)
  The machine schema every example in this repo pins via the `yaml-language-server` first line. Use for: settling "is this key valid?" disputes.
- [Docker MCP Gateway & catalog docs](https://docs.docker.com/desktop/features/mcp-catalog-and-toolkit/mcp-gateway/)
  How `ref: docker:…` catalog entries become containerized, digest-pinned tool calls. Use for: Ex02/Ex03 grounding.
- [Docker Agent ACP feature page](https://docs.docker.com/ai/docker-agent/features/acp/) and [Agent Client Protocol spec](https://agentclientprotocol.com)
  The editor-facing surface (Ex07). Use for: handshake details; ACP v1 stable vs v2 draft.
- [Docker Agent tips guide](https://docs.docker.com/ai/docker-agent/guides/tips/)
  Best practices for instructions and agent teams. Use for: writing better `instruction:` blocks in later lessons.
- **This repo's own distilled docs** — highest trust for *this machine's observed behavior*:
  `docs/notes/run-modes.md` (every run surface + the exit-code discipline), `docs/notes/flavors.md` (which flavor, when), `docs/notes/phase-notes.md` (cross-cutting findings), and each `ex*/README.md` (per-example gotchas with recorded run evidence).

## Wisdom (Communities)

- [Docker Community Slack — #docker-agent channel](https://github.com/docker/docker-agent#readme)
  The runtime team's own channel (listed under Community in the repo README). Use for: version-specific behavior questions the docs can't settle.
- [github.com/docker/docker-agent — issues](https://github.com/docker/docker-agent/issues)
  Maintainers answer issues directly. Use for: bug-vs-my-misread checks on specific CLI plugin versions.

## Gaps
- No trusted deep-dive on the `serve api` / `serve chat` surfaces — the repo recorded them as documented-but-unprobed; a future lesson must probe `docker agent serve --help` on this machine first.
- Community tutorials are mostly pre-rename ("cagent") and version-drifted; prefer official docs plus this repo's notes.