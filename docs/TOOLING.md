# Tooling

How the agent tooling is wired, and how to set it up on a new machine or with a different agent.

## Required on the machine

| Tool | Why | Install (macOS) |
|------|-----|-----------------|
| git, gh | repo and GitHub | `brew install git gh`, then `gh auth login` |
| uv | installs graphify | `brew install uv` |
| Azure CLI | deploy scripts (needed from the first iteration) | `brew install azure-cli`, then `az login` |
| Terraform | only if chosen as the IaC tool | `brew install terraform` |

## Graphify (code knowledge graph)

- Official project: <https://github.com/Graphify-Labs/graphify>, PyPI package `graphifyy` (two y's). Version used: see `docs/decisions.md` / `graphify --version`.
- Install the CLI once per machine:
  ```bash
  uv tool install graphifyy
  graphify hook install      # rebuild the graph automatically on commit/checkout/merge
  ```
- Generate or refresh the graph: ask the agent to run `/graphify .`, or run `graphify update .` (code only, no LLM needed).
- Output is in `graphify-out/`. See `.gitignore` for what is committed.
- Per-agent integration files are already committed (`CLAUDE.md`/`.claude/`, `GEMINI.md`/`.gemini/`, `.agents/`, `.github/`). On a fresh machine nothing more is needed except the CLI above.
- Remove: `graphify uninstall`.

## Ponytail (lazy senior dev rules)

- Official project: <https://github.com/DietrichGebert/ponytail> (MIT). Only trust that repo or the npm package `@dietrichgebert/ponytail`.
- Vendored into this repo at upstream commit `96608e0`:
  - always-on rules: inlined in `AGENTS.md`
  - skills (`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`): `.agents/skills/`, linked into `.claude/skills/` for Claude Code
- Update: re-copy `skills/` and the rules section from upstream, update the commit hash here, in `AGENTS.md` and in `docs/decisions.md`.
- Optional, Claude Code only: the upstream plugin adds a cost/token "band" above the prompt. It is not needed and not enabled by this repo. To try it: `/plugin marketplace add DietrichGebert/ponytail`, then (separate prompt) `/plugin install ponytail@ponytail`. If you do, the rules are injected twice (plugin + `AGENTS.md`); harmless.

## Agent support matrix

| Agent | Reads | Skills |
|-------|-------|--------|
| Claude Code | `CLAUDE.md` -> `AGENTS.md` | `.claude/skills/` |
| Gemini CLI | `GEMINI.md` -> `AGENTS.md` | `.agents/skills/` |
| Google Antigravity | `AGENTS.md`, `.agents/rules/` | `.agents/skills/` |
| GitHub Copilot (CLI, VS Code, coding agent) | `AGENTS.md`, `.github/copilot-instructions.md` | `.agents/skills/` |
| Codex, Cursor, others | `AGENTS.md` | `.agents/skills/` where supported |

If a new agent does not pick up the rules, tell it: "read AGENTS.md and docs/STATUS.md first".
