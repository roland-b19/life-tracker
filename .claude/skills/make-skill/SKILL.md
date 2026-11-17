---
name: make-skill
description: Turns a procedure or rules from the current conversation into a reusable skill or subagent, or updates an existing one. Use when the user says "turn what we did into a skill", "make this an agent" or "update the X skill with this", or asks to capture a repeatable process.
argument-hint: "[optional skill name or focus]"
---

# Make a skill

Capture a procedure the user walked through in this conversation as a lean, reliable skill or subagent that a future session can follow without this conversation's context.

## 1. Decide whether it should be a skill

Not every repeated thing is a skill. Pick the cheapest mechanism that works and tell the user if it isn't a skill:

| What it is | Where it goes |
|---|---|
| A one-line rule Claude needs in almost every session and would get wrong without it ("always use pnpm") | `CLAUDE.md`. It loads every session, so add nothing that a skill, a hook or the knowledge base can hold instead. |
| A fact, convention or preference needed only for some tasks | The knowledge base page that owns it, via maintain-kb Update. If the project has no knowledge base, offer to create one (maintain-kb). |
| "Every time X happens, do Y", done the same way each time | A hook. It runs without the model and costs no tokens. Its script goes in `.claude/skills/<owning skill>/scripts/`, its settings entry ships as `.claude/skills/<owning skill>/assets/hook-settings.json`, and the same entry goes in `.claude/settings.json`. |
| A multi-step procedure, judgment calls, or domain rules used repeatedly | A skill (continue below) |
| A procedure that needs no user input once started, where a separate context pays for itself through at least one of: lots of reading where only the conclusion matters, an independent review, restricted tools, a cheaper model, or work run in parallel | A subagent (continue below) |
| A change to something an existing skill already covers | Update that skill rather than creating a new one |

Skills are the default: choose a subagent only when a reason in its row applies. Before creating anything, check `.claude/skills/`, `.claude/agents/`, `~/.claude/skills/` and `~/.claude/agents/` for one that overlaps.

## 2. Extract the procedure from the conversation

Collect:
- **Trigger:** when this should run, and the phrases the user would naturally say.
- **Inputs:** what the skill needs to start (files, arguments, decisions).
- **Steps:** in order, as actually performed, including commands and tools used.
- **Rules:** constraints, always/never statements.
- **Corrections:** every place the user corrected or redirected you. These are the most valuable part, so each one becomes an explicit rule.
- **Output and definition of done:** what "finished" looks like and how it was verified.

Separate the **instance-specific** details (this file name, this value) from the **general** procedure. Only the general procedure goes into the skill; instance details become parameters or examples.

## 3. Ask only about the gaps

If something can't be inferred, ask with AskUserQuestion: at most 4 questions, only ones whose answer changes the skill. Typical gaps:
- Which parts vary from one use to the next?
- Anything to always or never do that didn't come up this time?

If everything is clear, skip this step.

## 4. Choose the location

Put a skill in `<repo>/.claude/skills/<name>/` and a subagent in `<repo>/.claude/agents/<name>.md`. Both live in each project, not in `~/.claude/`, because each project may need its own small changes. If it would help other projects too, say so.

## 5. Write the skill

For a subagent, read `.claude/skills/make-skill/references/subagent.md` now; it also covers the subagent's test.

```
<name>/
  SKILL.md       required: frontmatter + instructions
  references/    long details, loaded only when a step needs them
  scripts/       mechanical steps, executed rather than read
  assets/        templates and files the skill copies or fills in
```

Create only the folders the skill needs. Point to the skill's own files by full repo path (`.claude/skills/<name>/references/x.md`, `.claude/skills/<name>/assets/x`, `python3 .claude/skills/<name>/scripts/x.py`), never by a bare relative path or the skill's base directory: a skill that an agent preloads may not know its base directory.

**Frontmatter**
- `name`: kebab-case, starting with a verb (`make-skill`, `audit-project`), matching the folder name.
- `description`: third person. Say what it does and when to use it, including the user's likely trigger phrases. It is the only part loaded in every session and decides whether the skill fires, so make it specific enough not to fire on unrelated tasks. Keep it to 1–3 sentences.

**Body** (it costs tokens every time the skill runs)
- Numbered, imperative steps. Aim for under ~150 lines.
- Write each rule as a command with a test someone could check, plus a short reason, so it can be applied with judgment. Avoid "should", "try", "where appropriate" and "if needed": they invite different readings. Where a rule could still be read two ways, add an example.
- Leave out what the model already knows, and leave out the story of the conversation.
- Move anything long (API details, checklists over 20 lines, worked examples) to `references/`, with a note on when to read it.
- Turn steps that are identical every run (scaffolding, validation, data transforms) into scripts in `scripts/`, written the way the project's KB conventions say, and make them print only what's needed. Running a script is far cheaper than reasoning through the same steps.
- Include a **verification step** that checks the definition of done, before any final report.
- Use no secrets and no machine-specific absolute paths (use `~` or arguments instead).
- Name no project-specific decision IDs or KB sections: the skill is copied into other projects, where they mean something else or nothing. Give the reason in a few words instead.

## 6. Test it

1. Re-read the skill as a fresh session would: no access to this conversation, only the skill. Fix every step that relies on context it doesn't contain.
2. Walk it against a new, realistic example, different from the one we just did. Fix any ambiguity or missing branch.
3. Check the description: would it fire on the user's phrasing, and stay quiet for unrelated requests?
4. If scripts were written, run them once.

## 7. Record and report

If the project has a knowledge base, record the new skill or subagent on its architecture page (maintain-kb Update).

Tell the user briefly:
- its name and location, and the files created
- how to invoke it (`/<name>` or natural language for a skill; for a subagent, a request its description matches, or "use the <name> agent")
- anything you deliberately left out or put elsewhere (for example, a rule moved to `CLAUDE.md`)
