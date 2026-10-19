# 02: Ex01 — First agent on local gemma4 + verification template

**What to build:** Example 01 — the smallest working agent: a declarative YAML config on Docker Agent's built-in `ollama` provider using local `gemma4:latest`, exercising built-in toolsets (filesystem, shell, think) so the "no glue code" philosophy is visible. It runs both interactively (TUI, for the owner) and headless — and the headless run is the one verification seam every later example ticket reuses. Also performs the single pre-approved cloud smoke test (`glm-5.3-flash:cloud`) to prove the local-daemon→Ollama-Cloud sign-in routing once, with the approximate cost noted.

**Blocked by:** 01: Repo bring-up & decision record.

**Status:** resolved

- [x] Config uses a named models entry on the built-in `ollama` provider (local `gemma4:latest`) and the smoke prompt makes visible use of at least one built-in toolset
- [x] Headless `--exec` run exits 0 with observable task completion before the commit (this run pattern becomes the template referenced by later examples)
- [x] One cloud smoke round-trip via `glm-5.3-flash:cloud` succeeded through the local Ollama daemon; cost noted in the README
- [x] README documents: what it teaches, TUI + headless commands, the one-line local↔cloud model swap, and the running-daemon prerequisite
- [x] Exactly one commit containing all Example 01 artifacts

## Comments

- **2026-10-19 — resolved with run evidence.** Config `ex01-first-agent/agent.yaml`: named models entry `gemma4_local` (provider `ollama`, model `gemma4:latest`), agent `root` with toolsets `filesystem` (`allow_list: ["."]`), `shell`, `think`, `max_iterations: 20`; validated with `--dry-run`. Headless verification (`docker agent` v1.145.0): `--exec 'Read agent.yaml …' --safety restricted` → **exit 0**; transcript shows a visible `read_file` call — the agent first sent `limit: 0`, received `invalid limit 0: limit must be >= 1`, self-corrected, and answered `ollama gemma4:latest` / `filesystem shell think`. Cloud smoke (the single pre-approved check): one-line swap to `model: glm-5.3-flash:cloud` + `--exec 'Reply with the single word: pong'` → **exit 0**, `pong` returned through the local daemon → Ollama Cloud app sign-in; swap reverted, committed config stays on gemma4. Cost noted in README (≈ $0.15/$0.50 per 1M tokens → well under one cent). Two-axis code review (standards + spec) ran before the commit; applied fixes: README date corrected to 2026-10-19, the exactly-one-verification-command contract made explicit, swap doc duplication trimmed, trailing newlines added. Testing Decisions honored: no unit tests; the verification-first loop ran at the spec's single allowed seam (the CLI boundary) — verification command attempted before config finalization, then iterated to green.
