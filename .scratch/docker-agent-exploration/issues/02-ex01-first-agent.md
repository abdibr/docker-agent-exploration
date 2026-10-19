# 02: Ex01 — First agent on local gemma4 + verification template

**What to build:** Example 01 — the smallest working agent: a declarative YAML config on Docker Agent's built-in `ollama` provider using local `gemma4:latest`, exercising built-in toolsets (filesystem, shell, think) so the "no glue code" philosophy is visible. It runs both interactively (TUI, for the owner) and headless — and the headless run is the one verification seam every later example ticket reuses. Also performs the single pre-approved cloud smoke test (`glm-5.3-flash:cloud`) to prove the local-daemon→Ollama-Cloud sign-in routing once, with the approximate cost noted.

**Blocked by:** 01: Repo bring-up & decision record.

**Status:** ready-for-agent

- [ ] Config uses a named models entry on the built-in `ollama` provider (local `gemma4:latest`) and the smoke prompt makes visible use of at least one built-in toolset
- [ ] Headless `--exec` run exits 0 with observable task completion before the commit (this run pattern becomes the template referenced by later examples)
- [ ] One cloud smoke round-trip via `glm-5.3-flash:cloud` succeeded through the local Ollama daemon; cost noted in the README
- [ ] README documents: what it teaches, TUI + headless commands, the one-line local↔cloud model swap, and the running-daemon prerequisite
- [ ] Exactly one commit containing all Example 01 artifacts