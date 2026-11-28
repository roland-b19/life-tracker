# Set a project up for pull requests

Run once per project, when merge-branch finds the project isn't set up. Each step that changes something on GitHub needs the user's OK first.

1. **GitHub and gh.** The repo has an `origin` remote on GitHub, and `gh auth status` succeeds. If not, the user creates the repo and runs `gh auth login` themselves; never enter their credentials.
2. **One check command.** It runs the fast checks: the linters, the type checker, the unit tests and the KB check (`python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`), in under a minute, and exits non-zero when any of them fails. End-to-end tests are never in it: they run at a feature's end (the verify skill). Find the project's command that does this (for example `npm run check` or `make check`); if there is none, add one in the stack's usual place. In a new project with no stack yet, add a `Makefile` whose `check` target runs the KB check, and grow it as the stack arrives. In a project the workflow was installed into, its linters, type checker and test discovery leave out `.claude/`: the workflow's scripts there are tested in the workflow's own repo and needn't follow the project's style. Agents and CI both run this command, so a new fast check goes into it, never only into CI.
3. **CI workflow.** Write `.github/workflows/checks.yml` from this template. Replace the setup comment with the stack's steps (runtime, then the dependency install from the lockfile), keep the job name `checks` (step 6 requires it; an extra job's name is added to that list), the `concurrency` block (a new push cancels the branch's older run) and a Linux runner: macOS and Windows minutes count several times over against the plan's free minutes. If the project already has a CI workflow that runs on pull requests, add the `checks` job to it instead; ask the user before adding a second workflow file.

   ```yaml
   name: checks
   on:
     pull_request:
     workflow_dispatch:
   permissions:
     contents: read
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   jobs:
     checks:
       runs-on: ubuntu-latest
       timeout-minutes: 10
       steps:
         - uses: actions/checkout@v7
         # Stack setup: runtime (actions/setup-node, actions/setup-python, ...) and dependency install.
         - run: <the one check command>
     # CI runs only the fast checks; end-to-end tests run locally at a feature's end (the verify skill).
   ```
4. **Record it.** On the KB conventions page, check that the Checks entry names this command (verify's setup step 7 fills it; fill it here if that hasn't run), and keep "Merge on green: off" unless the user turns it on.
5. **First PR.** Take the workflow, the check command and the record to the default branch with merge-branch; when this setup is part of a larger change (such as installing the workflow), that change's pull request is the first PR. Its CI run is the first proof that the workflow works, so the steps below wait for it to be green.
6. **Protect the default branch.** This changes the repo's settings. Replace `main` with the default branch. Show the user every setting that would change, including the merge methods turned off, and go on only on their OK. First the merge settings, which merge-branch's cleanup relies on (`delete_branch_on_merge`):

   ```bash
   gh api -X PATCH 'repos/{owner}/{repo}' -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false -F delete_branch_on_merge=true
   ```

   Then read the protection there: `gh api 'repos/{owner}/{repo}/branches/main/protection'` (a 404 means none) and `gh api 'repos/{owner}/{repo}/rulesets'`. If rules exist, keep them and add `checks` to their required status checks instead of running the command below.

   ```bash
   gh api -X PUT 'repos/{owner}/{repo}/branches/main/protection' --input - <<'EOF'
   {
     "required_status_checks": {"strict": true, "contexts": ["checks"]},
     "enforce_admins": true,
     "required_pull_request_reviews": {"required_approving_review_count": 0},
     "restrictions": null,
     "allow_force_pushes": false,
     "allow_deletions": false
   }
   EOF
   ```

   This requires a PR with 0 approvals (a solo user can't approve their own), a green `checks` run on a branch that is up to date with `main`, and holds for admins too, so Claude's token can't push `main`. A private repo on GitHub Free gets a 403 here, because protection there needs Pro or Team: tell the user, skip the protection, and the golden rules alone hold.
7. **Verify.** With the protection above, `gh api 'repos/{owner}/{repo}/branches/main/protection' --jq '[.required_status_checks.contexts, .enforce_admins.enabled]'` prints `[["checks"],true]`. With rules kept from before, `gh api 'repos/{owner}/{repo}/rules/branches/main'` lists a required status check named `checks`.
