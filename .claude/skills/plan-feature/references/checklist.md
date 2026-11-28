# Plan checklist

A plan is complete when every core item passes, and every conditional item passes whenever its condition holds. `check_plan.py` checks only the items marked (script); the rest need a reader.

## Core items (every plan)
1. **Goal.** States the problem and who it is for in 1–3 sentences. Test: a reader can say why the feature exists without the chat.
2. **Scope.** Lists what is in and what is out. Test: each "out" item names something a builder might otherwise do.
3. **Done criteria.** Each criterion is observable and names how it is checked: a test, a command and its expected output, or a look the user asked for. Test: no criterion uses words such as "works well", "clean" or "fast" without a measure.
4. **Decisions settled.** Every design choice the feature needs is made with the user and recorded as a decision in the KB, and the plan names each one by its ID. No open questions remain (script: no `TBD`, `TODO` or `???`). Test: no step makes the builder choose between designs.
5. **Steps.** Ordered, each small enough to build and test on its own, each naming the files it creates, changes or deletes and the tests it adds or runs (script: every step has `files:` and `tests:`). A step with no tests says why, for example `tests: none (docs only)`. Test: following the steps in order never needs a file that a later step creates.
6. **Cleanup and docs.** Names what becomes unused (code, files, dependencies, config, docs) and every rule, skill, KB page, convention or doc the change makes wrong. Test: a search for the changed names finds nothing the plan doesn't mention.
7. **Hand-off.** A new session with only the repo, the KB and this page could build the feature. Test: the page doesn't say "as discussed", "see above in chat" or name anything only the chat explains.

## Conditional items
8. **Data migration** — when stored data, a schema or a config format changes. Names the migration step, how it is tested on a copy, and how to go back.
9. **Risks and spikes** — when a step depends on something not yet proven (an API's limits, a library's behaviour, performance). Each risk names a spike step that settles it before the steps that depend on it.

## Status (script)
The page ends with `Status: draft`, `Status: approved YYYY-MM-DD` or `Status: done YYYY-MM-DD`.
