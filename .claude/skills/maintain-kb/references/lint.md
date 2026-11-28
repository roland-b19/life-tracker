# Lint: keep the KB accurate and lean

Run a lint when the user asks for one or when the check reports 5 or more warnings.

1. **Mechanical checks.** Run `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb` and fix every ERROR it prints.
2. **Stale pages** are flagged because their covered code changed or they were verified long ago. Read the page and the code it covers, fix what's wrong, and set `last_verified` to today. If more than 3 pages are stale, have a subagent (Sonnet, medium effort) verify them against the code and apply its findings, so the code reads stay out of this context.
3. **Contradictions and duplicates.** Using the INDEX summaries, and grep for topics INDEX doesn't list, open the pages whose topics overlap. Keep each fact in one home and replace the copies with links.
4. **Bloat.** Delete obsolete content, and superseded or obsolete decisions (rule 4). Split what is over its cap (rule 6).
5. Re-run the script until there are 0 errors, then report what changed in 3–5 lines.
