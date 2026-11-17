---
summary: How we work together, the project's one way to do each job, and its gotchas.
last_verified: <YYYY-MM-DD>
---

# Conventions

## Working together
<The user's working preferences: how they want options presented, what needs their word first.>
- **When the user is away:** after the user says they are away or asleep, don't wait, ask questions or ask permission until they are back. At each choice take the option you would recommend, keep going, and list the choices made in the PR body and the KB log. The user's away message can allow what normally needs their word, such as merging; the safety limits still hold.

## One way to do each job
<One bullet per job: the project's one way to do it (golden rule 1).>
- **Planning a feature:** the plan-feature skill, before any building.
- **Finding code:** plain search (Grep, Glob, reads) for ideas and areas, starting from the KB architecture page. Where a language server plugin is installed, use the LSP tool only when an exact location is needed: a definition, every caller or reference before changing or removing something, or the exact line to edit; never to browse. Its automatic error reports stay on. No stored code indexes.
- **Finding KB facts:** INDEX first; when it names no page, the KB search (maintain-kb SKILL.md, Search), then read the sections it points to. Grep only to list every occurrence of an exact string, such as a decision's usages.
- **Checks:** the verify skill has run at the change's test tier, the fast checks pass, and review-change has run; its PR body lists every finding as fixed or with a reason.
  - **Fast checks** (the one check command): <command, in backticks>
  - **One end-to-end spec:** <command, in backticks>
  - **Targets:** <browsers or devices>
- **Risk tiers:** review-change's tier script reads the two lists below from the default branch's copy of this page; a changed file in neither list is Medium.
  - **Low:** `docs/**`, `**/README.md` (add the project's test folders)
  - **High:** `.github/**`, `.claude/settings*.json`, `**/hook-settings.json`, `**/*_hook.py` (add the project's auth, payments, installer and data-migration paths)
- **Merge on green:** off

Deprecated patterns: none.

## Gotchas
<Traps a new agent would fall into, each with what to do instead.>
