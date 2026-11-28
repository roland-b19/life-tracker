---
name: maintain-kb
description: Builds and maintains the project's knowledge base in docs/kb: product and domain knowledge, decisions, architecture, conventions and status. Use when the user says "update the knowledge base", "build the knowledge base" or "lint the kb", and right after a change alters a fact, decision, rule or convention.
---

# Maintain the knowledge base

The knowledge base (KB) lives in `docs/kb/`. It holds what an engineer on the project keeps in their head and the code doesn't show: the product and its domain, decisions and their reasons, how things fit together, and where work stands. `CLAUDE.md` imports `docs/kb/INDEX.md`, so the index loads in every session. Every other page is read only when a task needs it.

Pick the operation:
- No `docs/kb/` yet, or "build the knowledge base" → read `.claude/skills/maintain-kb/references/init.md`.
- "Update the knowledge base…", or a change just altered a fact, decision, rule or convention (golden rule 5) → follow **Update** below.
- "Check / lint / clean up the KB" → read `.claude/skills/maintain-kb/references/lint.md`.

## Rules (for every operation)

1. **Store the why, not the what.** Record decisions, rejected alternatives, intent, gotchas, current state and open threads. Don't copy what code or git already shows (file lists, signatures, diffs): it costs tokens and goes stale.
2. **One home per fact.** Each fact lives on exactly one page, and other pages link to it. This prevents contradictions. The KB is the only home for project facts. Personal notes go in `CLAUDE.local.md` or `~/.claude/CLAUDE.md`, and secrets go nowhere in either.
3. **State pages describe the present.** Rewrite the affected section of architecture, status and conventions pages so it matches reality. History goes only in the decision pages and git.
4. **Delete what is obsolete.** A superseded or obsolete decision, a finished plan page and a removed fact are deleted; the decision that replaces one names it; git history keeps the text. Rewriting a state page to the present (rule 3) is not removal.
5. **Code wins.** If the KB contradicts the code, the KB is wrong. Fix it whenever you notice, not only during updates.
6. **Stay small.** Keep `INDEX.md` to 60 lines or fewer and each page to 250 lines or fewer. Split a page that grows past the cap by subtopic and index the parts. When INDEX passes 55 lines, group its entries under section index pages, so it stays under its cap.
7. **Edit, don't rewrite.** Change only the affected lines with Edit. Never regenerate a whole page to change one section.

## Layout

```
docs/kb/
  INDEX.md
  domain.md
  architecture.md
  decisions/        one page of decisions per area
  conventions.md
  status.md
  plans/            one page per feature plan, written by the plan-feature skill
```

Every page except INDEX starts with frontmatter (`summary`, optional `covers`, `last_verified`), as in `.claude/skills/maintain-kb/assets/page.md`. Templates are in `.claude/skills/maintain-kb/assets/`; a page with no template of its own starts from `.claude/skills/maintain-kb/assets/page.md`. Give pages clear names (`payments-flow.md`, not `notes2.md`), write headings and summaries with the words someone would search for, and give each topic its own `##` section.

## Update

1. **Collect.** From this conversation, list everything durable that happened: decisions and the alternatives rejected, product and domain facts the user explained (features, specs, business rules, terms, config values and their reasons), changes to how the system works, new conventions or gotchas, user preferences, finished work and open threads. In a git repo, also run `git status --short` and `git diff --stat` to catch changes the conversation doesn't mention. Drop anything transient, such as chat, or debugging dead ends that don't teach a gotcha.
2. **Route** each item to its one home. Grep `docs/kb/` for the item first and update the page that already holds it, so no fact gets a second home:
   - product, spec, domain rule, term, or a config value and its reason → `domain.md`
   - decision → a new `D-NNN` entry, the next number after the highest `D-NNN` any decisions page names, at the bottom of the `decisions/<area>.md` page for its area (if it replaces an older decision, apply rule 4). A new area gets a page from `.claude/skills/maintain-kb/assets/decisions.md`, plus an INDEX entry
   - how the system works → the relevant section of `architecture.md` or a topic page
   - the project's one way to do a job, a deprecated pattern, a gotcha or a preference → `conventions.md`
   - remaining usages of a deprecated pattern → `status.md`
   - progress, next steps, open questions → `status.md` (rewritten to the current picture)
   - a feature's plan and its progress → `plans/<feature>.md`, through the plan-feature skill
   - a topic with no page it fits, or one that would push its page past 250 lines → a new page from `.claude/skills/maintain-kb/assets/page.md`, plus an INDEX entry
3. **Apply** with targeted edits. Set `last_verified` to today on each page you changed or checked against the code.
4. **Index.** Update INDEX.md: the current-state lines, plus the page map if pages were added, renamed or split.
5. **Check.** Run the check script:
   `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`
   Fix every ERROR. For each WARN:
   - **Covered code changed:** if this session changed that code, re-read the page against the code, fix what's wrong and set its `last_verified` to today. If it didn't, list the warning in the report.
   - **Any other WARN:** list it in the report.
6. **Report** once, at the end of the task, not after every Update: in 3–5 lines, the pages changed, decisions recorded and warnings left open. Don't paste KB content into the chat.
