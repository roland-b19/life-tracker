---
summary: How we work together, the project's one way to do each job, and its gotchas.
last_verified: <YYYY-MM-DD>
---

# Conventions

## Working together
<The user's working preferences: how they want options presented, what needs their word first.>
- **When the user is away:** after the user says they are away or asleep, don't wait, ask questions or ask permission until they are back. At each choice take the option you would recommend, keep going, and list the choices made in the PR body. The user's away message can allow what normally needs their word, such as merging; the safety limits still hold.

## One way to do each job
<One bullet per job: the project's one way to do it (golden rule 1).>
- **Planning a feature:** the plan-feature skill, before any building.
- **Finding code:** plain search (Grep, Glob, reads) for ideas and areas, starting from the KB architecture page. Where a language server plugin is installed, use the LSP tool only when an exact location is needed: a definition, every caller or reference before changing or removing something, or the exact line to edit; never to browse. Its automatic error reports stay on. No stored code indexes.
- **Finding KB facts:** INDEX first; when it names no page, grep `docs/kb/`, then read the sections it points to.
- **Checks:** the verify skill has run at the change's test tier, the fast checks pass, and `/code-review medium` has run on the branch; the PR body's Review section lists every finding as fixed or with a reason.
  - **Fast checks** (the one check command): <command, in backticks>
  - **One end-to-end spec:** <command, in backticks>
  - **Targets:** <browsers or devices>
- **Merge on green:** off

Deprecated patterns: none.

## Gotchas
<Traps a new agent would fall into, each with what to do instead.>
