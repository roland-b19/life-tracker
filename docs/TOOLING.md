# Tooling

How the agent tooling is wired, and how to set it up on a new machine or with a different agent.

## Required on the machine

| Tool | Why | Install (macOS) |
|------|-----|-----------------|
| git, gh | repo and GitHub | `brew install git gh`, then `gh auth login` |
| uv | installs graphify | `brew install uv` |
| pre-commit, gitleaks | local secret scan before each commit (`.pre-commit-config.yaml`) | `brew install pre-commit gitleaks`, then `pre-commit install` |
| Azure CLI | deploy scripts (needed from the first iteration) | `brew install azure-cli`, then `az login` |
| Bicep | IaC (comes with Azure CLI, `az bicep install`) | included in `brew install azure-cli` |

## Graphify (code knowledge graph)

- Official project: <https://github.com/Graphify-Labs/graphify>, PyPI package `graphifyy` (two y's). Version used: see `docs/decisions.md` / `graphify --version`.
- Install the CLI once per machine:
  ```bash
  uv tool install graphifyy
  graphify hook install      # rebuild the graph automatically on commit/checkout/merge
  ```
- Generate or refresh the graph: ask the agent to run `/graphify .`, or run `graphify update .` (code only, no LLM needed).
- Output is in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`). It is git-ignored on purpose: it is derived, and the post-commit hook rewrites it on every commit, which would leave the tree dirty after each commit. Each machine builds its own.
- Per-agent integration files are already committed. On a fresh machine nothing more is needed except the CLI above:
  - `AGENTS.md` (`## graphify` section): the usage rules, read by every agent
  - `.agents/skills/graphify/`: the skill (one real copy); `.claude/skills/graphify` is a symlink to it
  - `.claude/settings.json`: Claude Code `PreToolUse` hooks (`graphify hook-guard`)
  - `.gemini/settings.json`: Gemini CLI `BeforeTool` hook
  - `.agents/rules/graphify.md`, `.agents/workflows/graphify.md`: Google Antigravity
  - `.github/copilot-instructions.md`: GitHub Copilot
- The hooks call `graphify` from `PATH`, so the CLI must be installed on every machine where an agent runs. They only nudge the agent toward the graph; they do not block work.
- Codex: reads `AGENTS.md`, no extra files needed (graphify's Codex hook is a no-op and was not committed).
- Remove: `graphify uninstall`.

## Gotchas

- Symlinks: `.claude/skills/*` are symlinks into `.agents/skills/*`. On Windows run `git config core.symlinks true` (and enable Developer Mode) before cloning, or copy the folders instead.
- A personal global gitignore that ignores `.claude/` is overridden by `!.claude/` in this repo's `.gitignore`, so the shared Claude Code config is committed.
- `graphify install` / `graphify gemini install` / `graphify vscode install` also drop copies of the skill in your home folder (`~/.gemini/skills`, `~/.copilot/skills`). Not needed here: the project-scoped skill in `.agents/skills/` is enough.

## Ponytail (lazy senior dev rules)

- Official project: <https://github.com/DietrichGebert/ponytail> (MIT). Only trust that repo or the npm package `@dietrichgebert/ponytail`.
- Vendored into this repo at upstream commit `96608e0`:
  - always-on rules: inlined in `AGENTS.md`
  - skills (`ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`): `.agents/skills/`, linked into `.claude/skills/` for Claude Code
- Update: re-copy `skills/` and the rules section from upstream, update the commit hash here, in `AGENTS.md` and in `docs/decisions.md`.
- Optional, Claude Code only: the upstream plugin adds a cost/token "band" above the prompt. It is not needed and not enabled by this repo. To try it: `/plugin marketplace add DietrichGebert/ponytail`, then (separate prompt) `/plugin install ponytail@ponytail`. If you do, the rules are injected twice (plugin + `AGENTS.md`); harmless.

## Apple design skill

- `.agents/skills/apple-design/`: `SKILL.md` (router + non-negotiables), `references/*.md` (distilled HIG, one file per area), `scripts/` (re-fetch and convert the HIG). `.claude/skills/apple-design` is a symlink to it.
- Source: Apple's public HIG, <https://developer.apple.com/design/human-interface-guidelines/>, fetched 2026-11-02. Apple's text is copyrighted: the references are rewrites, not copies. Refresh procedure: `SKILL.md`, last section.
- Design assets (fonts, SF Symbols app, Icon Composer, UI kits) are downloaded by the user from <https://developer.apple.com/design/resources/>, not stored in the repo. Licence notes: `references/resources.md`.

## Secure development skill

- `.agents/skills/secure-development/`: `SKILL.md` (router + non-negotiables + refresh procedure), `references/*.md` (ASVS 5.0, Top 10:2025, NIST SSDF, cheat sheets, plus optional Azure, AI and iOS files), `templates/` (threat model, risk register, ASVS matrix, data inventory). `.claude/skills/secure-development` is a symlink to it.
- Sources are mostly OWASP (CC BY-SA 4.0), rewritten with attribution in each `Sources` line; fetched 2026-11-02. Refresh procedure: `SKILL.md`, last section.
- Project plan and decisions: `docs/security-plan.md`.

## Code review skill

- `.agents/skills/code-review-guide/`: `SKILL.md` (router + procedure), `references/` (reviewer guide, author guide, security review, reviewing agent-written code), `templates/pull-request.md`. `.claude/skills/code-review-guide` is a symlink to it. Named `-guide` to avoid a clash with the built-in `code-review` skill of Claude Code.
- Sources: Google Engineering Practices, Microsoft Code-With Engineering Playbook, OWASP Code Review Guide (fetched 2026-11-02). Refresh procedure: `SKILL.md`, last section.

## House design skill

- `.agents/skills/ultimate-design-skill/`: `SKILL.md` (principles, no-motion rule, recipe, rejected ideas, checklist), `references/values.md` (every token and size), `references/lists-and-crud.md` (lists and add/edit/delete/Undo code). `.claude/skills/ultimate-design-skill` is a symlink to it.
- Source of truth: the Wishlist page (`app/wishlist/`). When the code changes, update the skill in the same PR.

## Starting other projects

The generic setup for a new project (same structure and the same 5 skills) lives outside this repo: `~/Documents/projects/project-setup/` (`SKILL.md`, `setup.sh`).

## Agent support matrix

| Agent | Reads | Skills |
|-------|-------|--------|
| Claude Code | `CLAUDE.md` -> `AGENTS.md` | `.claude/skills/` |
| Gemini CLI | `GEMINI.md` -> `AGENTS.md` | `.agents/skills/` |
| Google Antigravity | `AGENTS.md`, `.agents/rules/` | `.agents/skills/` |
| GitHub Copilot (CLI, VS Code, coding agent) | `AGENTS.md`, `.github/copilot-instructions.md` | `.agents/skills/` |
| Codex, Cursor, others | `AGENTS.md` | `.agents/skills/` where supported |

If a new agent does not pick up the rules, tell it: "read AGENTS.md and docs/STATUS.md first".
