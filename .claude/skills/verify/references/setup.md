# Set up testing in a project

1. **Find what exists.** In a new project with no code yet, ask the user the stack, the kind of project (web, mobile, API, CLI or library) and its targets (browsers or devices): the tools here and the CI setup depend on them. Otherwise, look for test folders, test configs, linter and type-checker configs, and test scripts in the package manifest. If the project already has a runner, keep it (golden rule 1). If it has two, ask the user which one wins. Run the existing tests and linters: if any fail, show the user, then fix them, or leave them out of the check command and track them on the KB status page.
2. **Pick the tools per part of the project.** Read the reference for each kind of project it has, and only those:
   - web UI: `.claude/skills/verify/references/web.md`
   - mobile app: `.claude/skills/verify/references/mobile.md`
   - HTTP API or backend: `.claude/skills/verify/references/api.md`
   - CLI, script or library: `.claude/skills/verify/references/cli.md`
   Installing a tool follows find-or-build-tool's rules.
3. **Make each tier one command** that runs headless, with no prompts and no watch mode, so it gives the same answer on every run; CI runs the fast checks command exactly as written. The fast checks are the project's one check command, as `.claude/skills/merge-branch/references/setup-github.md` step 2 defines it (for example `npm run check`); if the project has none yet, make it as that step says.
4. **Write a first test per tier** and see each one pass: one fast test, and one end-to-end spec for the main user flow. With no app code yet, skip the end-to-end spec; with no stack yet, skip both. Note what was skipped on the KB status page, so the first feature adds it.
5. **Wire the Stop hook.** Merge `.claude/skills/verify/assets/hook-settings.json` into `.claude/settings.json`, next to any hooks already there, and replace `<the one check command>` with that command: one argument per item, no shell syntax, or `sh -c '<command>'` when it needs a shell (pipes, `&&`). For example, the command ends in `verify_hook.py\" npm run check --silent`. Tell the user that a session started before the settings file existed won't load the hook until it is restarted.
6. **Turn off Preview auto-verify.** If the project has `.claude/launch.json`, or you create one, set the top-level key `"autoVerify": false`. Otherwise the desktop app makes Claude look at the app after every edit.
7. **Offer screenshot tests** only for a project whose UI matters most: explain that they catch visual changes but also fail when fonts or the OS differ, and add them only on the user's yes.
8. **Record it in the KB** (maintain-kb Update): the conventions page's Checks entry (the fast checks command, how to run one end-to-end spec, and the targets), and the tool choices with their reasons in decisions.
