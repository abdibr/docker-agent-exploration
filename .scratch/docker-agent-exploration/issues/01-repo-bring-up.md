# 01: Repo bring-up & decision record

**What to build:** A git-initialized repo (local only, no remote) that becomes the durable, navigable home for the whole exploration: a root README recording the agreed decisions from the published spec (`Status: ready-for-agent` sibling file in this feature directory — model defaults, YAML configs, headless-verification rule, the 01–07 example sequence, commit conventions), plus ignore rules so nothing stray gets committed later.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Git repository initialized locally with the configured identity; working tree clean after the initial commit
- [x] Root README records the key spec decisions (local-first models, cloud agentic default routed via the Ollama daemon, YAML configs, verification-before-commit, example sequence, one commit per example)
- [x] Ignore rules cover build/env artifacts such as node_modules and local env files, without excluding the issue tracker itself
- [x] No example content included yet — this ticket only brings the repo up
## Comments

- 2026-10-17 (agent): Implemented. Repo initialized on `main`, no remote, identity `Developer <developer@example.com>` matching the configured git identity. `README.md` records the spec decisions (local-first models via the Ollama daemon, `glm-5.3-flash:cloud` agentic default routed through that daemon, declarative YAML configs with named `models:` entries, headless verification before commit, the 01–07 example sequence, one commit per example, no secrets). `.gitignore` covers `node_modules/`, build output, `.env*` local env files (`.env.example` explicitly un-ignored), logs and OS noise; `.scratch/` stays tracked — verified with `git check-ignore`. No example content committed; work continues at ticket 02. Working tree is clean after the initial commit.