---
name: maintain-kb
description: Builds and maintains the project's knowledge base in docs/kb: product and domain knowledge, decisions, architecture, conventions, status and session log. Use when the user says "update the knowledge base", "build the knowledge base" or "lint the kb", and right after a change alters a fact, decision, rule or convention.
---

# Maintain the knowledge base

The knowledge base (KB) lives in `docs/kb/`. It holds what an engineer on the project keeps in their head and the code doesn't show: the product and its domain, decisions and their reasons, how things fit together, and where work stands. `CLAUDE.md` imports `docs/kb/INDEX.md`, so the index loads in every session. Every other page is read only when a task needs it.

Pick the operation:
- No `docs/kb/` yet, or "build the knowledge base" → read `.claude/skills/maintain-kb/references/init.md`.
- "Update the knowledge base…", or a change just altered a fact, decision, rule or convention (golden rule 5) → follow **Update** below.
- "Check / lint / clean up the KB", or the check script flags a past month that needs a rollup → read `.claude/skills/maintain-kb/references/lint.md`.

## Rules (for every operation)

1. **Store the why, not the what.** Record decisions, rejected alternatives, intent, gotchas, current state and open threads. Don't copy what code or git already shows (file lists, signatures, diffs): it costs tokens and goes stale.
2. **One home per fact.** Each fact lives on exactly one page, and other pages link to it. This prevents contradictions. The KB is the only home for project facts. Personal notes go in `CLAUDE.local.md` or `~/.claude/CLAUDE.md`, and secrets go nowhere in either.
3. **State pages describe the present.** Rewrite the affected section of architecture, status and conventions pages so it matches reality. History goes only in `log/` and the decision pages.
4. **Never delete knowledge.** Archive only content dropped as obsolete; rewriting a state page to the present (rule 3) is not removal. A superseded decision gets `Status: superseded by D-NNN (date)` and moves to `archive/decisions.md`. A decision that no longer applies but was never superseded (obsolete, or merged into another) moves there too, with a Status line saying why, such as `Status: obsolete (date): <reason>` or `Status: merged into D-NNN (date)`. A whole page that becomes obsolete, such as a finished feature's plan, moves to `archive/` at the same relative path (`plans/x.md` → `archive/plans/x.md`). Other obsolete content moves to `archive/<page>.md` under a dated heading.
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
  log/YYYY-MM.md
  plans/            one page per feature plan, written by the plan-feature skill
  archive/          created when first needed
```

Every page except INDEX, `log/` and `archive/` starts with frontmatter (`summary`, optional `covers`, `last_verified`), as in `.claude/skills/maintain-kb/assets/page.md`. Templates are in `.claude/skills/maintain-kb/assets/`; a page with no template of its own starts from `.claude/skills/maintain-kb/assets/page.md`. Give pages clear names (`payments-flow.md`, not `notes2.md`), write headings and summaries with the words someone would search for, and give each topic its own `##` section.

**Search.** `python3 .claude/skills/maintain-kb/scripts/kb_search.py <words>` finds the KB sections for a question when INDEX names no page. It reads the pages live, so there is nothing to rebuild. It ranks a section's `##` heading highest, then the page's title, summary and file name, then the text. Add `--history` to search `log/` and `archive/`.

## Update

1. **Collect.** From this conversation, list everything durable that happened: decisions and the alternatives rejected, product and domain facts the user explained (features, specs, business rules, terms, config values and their reasons), changes to how the system works, new conventions or gotchas, user preferences, finished work and open threads. In a git repo, also run `git status --short` and `git diff --stat` to catch changes the conversation doesn't mention. Drop anything transient, such as chat, or debugging dead ends that don't teach a gotcha.
2. **Route** each item to its one home. Search for the item first (see Search) and update the page that already holds it, so no fact gets a second home:
   - product, spec, domain rule, term, or a config value and its reason → `domain.md`
   - decision → a new `D-NNN` entry, the next number after the highest in `decisions/` and `archive/decisions.md`, at the bottom of the `decisions/<area>.md` page for its area (if it replaces an older decision, apply rule 4). A new area gets a page from `.claude/skills/maintain-kb/assets/decisions.md`, plus an INDEX entry
   - how the system works → the relevant section of `architecture.md` or a topic page
   - the project's one way to do a job, a deprecated pattern, a gotcha or a preference → `conventions.md`
   - remaining usages of a deprecated pattern → `status.md`
   - progress, next steps, open questions → `status.md` (rewritten to the current picture)
   - a feature's plan and its progress → `plans/<feature>.md`, through the plan-feature skill
   - a topic with no page it fits, or one that would push its page past 250 lines → a new page from `.claude/skills/maintain-kb/assets/page.md`, plus an INDEX entry
3. **Apply** with targeted edits. Set `last_verified` to today on each page you changed or checked against the code.
4. **Log.** Add to this session's entry in `log/YYYY-MM.md`. On the session's first Update, create the entry at the bottom of the file, and for a new month create the file from `.claude/skills/maintain-kb/assets/log-month.md`. An entry has the date, a title, 3–6 bullets of what was done or decided (link the `D-NNN` entries) and what's next. Each bullet is one line of at most 200 characters: the details live in the decision, the KB page or the PR, so the log only points at them.
5. **Index.** Update INDEX.md: the current-state lines, plus the page map if pages were added, renamed or split.
6. **Check.** Run the check script:
   `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`
   Fix every ERROR. For each WARN:
   - **Covered code changed:** if this session changed that code, re-read the page against the code, fix what's wrong and set its `last_verified` to today. If it didn't, list the warning in the report.
   - **Log bullet too long:** shorten it to one line and move the detail where it belongs.
   - **Past month needs a rollup:** do the **Log rollup** step in `.claude/skills/maintain-kb/references/lint.md`.
   - **Any other WARN:** list it in the report.
7. **Report** once, at the end of the task, not after every Update: in 3–5 lines, the pages changed, decisions recorded and warnings left open. Don't paste KB content into the chat.
