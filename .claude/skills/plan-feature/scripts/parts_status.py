#!/usr/bin/env python3
"""Show where each part of a plan's work split stands, and what to do next.

Usage: python3 parts_status.py docs/kb/plans/<feature>.md

Reads the plan page's work split. The feature is the page's file name without `.md`; a part's slug
is `<feature>-<part letter in lower case>`. A branch belongs to a part when the last segment of its
name, without a leading `worktree-`, equals the slug or starts with the slug and `-` (so the desktop
app's `claude/<slug>-<suffix>` and the terminal's `worktree-<slug>` both match).
Branches come from git (local and `origin`), PRs from `gh pr list`, only those created since the
plan's approval date when its status has one. When a part has several PRs, the highest number counts,
and a part with a PR shows the PR's state rather than its branch's, except a closed PR when the part
has another branch, which is a restart.
Prints one line per part, then `Next:` lines: parts to start, the part to merge next (strictly in
table order), PRs closed without merging that the user must settle, or that the feature can be
finished. When `gh` fails, or returns a full page so that older PRs may be missing, prints the
git-only states and no `Next:` lines.
Exit code 1 when the page has no work split or the plan check finds errors in it.
"""
import json
import re
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
# The table is read the way the plan check reads it, and git is called the way merge-branch calls it.
sys.path.insert(0, str(HERE.parents[1] / "merge-branch/scripts"))
sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folders
from check_plan import COMMENT, FENCE, check_split, sections, split_rows  # noqa: E402
from overlap import git  # noqa: E402

FAIL = {"FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"}
PASS = {"SUCCESS", "NEUTRAL", "SKIPPED"}
GH_FIELDS = "number,state,headRefName,statusCheckRollup"
GH_LIMIT = 500
APPROVED = re.compile(r"^Status: approved (\d{4}-\d{2}-\d{2})\s*$", re.M)


def slug(feature, part):
    return f"{feature}-{part.lower()}"


def belongs(branch, part_slug):
    """True when the branch name is one of this part's branches."""
    last = branch.rsplit("/", 1)[-1].removeprefix("worktree-")
    return last == part_slug or last.startswith(part_slug + "-")


def ci_state(rollup):
    """fail, pending, pass or none, from a PR's statusCheckRollup items (check runs and status contexts)."""
    if not rollup:
        return "none"
    states = set()
    for item in rollup:
        value = item.get("conclusion") or item.get("state") or ""
        if item.get("status", "COMPLETED") != "COMPLETED":  # only check runs have a status
            states.add("pending")
        else:
            states.add("fail" if value in FAIL else "pass" if value in PASS else "pending")
    return "fail" if "fail" in states else "pending" if "pending" in states else "pass"


def report(feature, rows, branches, prs):
    """The output lines. rows: split_rows' parts; branches: names, local ones first;
    prs: gh's dicts, or None when gh failed."""
    found = {}  # part -> (its PR or None, its PR's state or None, its first branch or None)
    for part, _, _ in rows:
        s = slug(feature, part)
        mine = [p for p in prs or [] if belongs(p["headRefName"], s)]
        pr = max(mine, key=lambda p: p["number"]) if mine else None
        old = pr["headRefName"] if pr and pr["state"] == "CLOSED" else None
        branch = next((b for b in branches if belongs(b, s) and b.removeprefix("origin/") != old), None)
        if old and branch:  # the part was restarted on a new branch after its PR was closed
            pr = None
        found[part] = (pr, pr and pr["state"], branch)
    merged = {part for part, (_, state, _) in found.items() if state == "MERGED"}
    lines = []
    for part, _, needs in rows:
        pr, state, branch = found[part]
        waiting = [n for n in needs if n not in merged]
        if state == "MERGED":
            text = f"merged (#{pr['number']})"
        elif state == "OPEN":
            text = f"PR #{pr['number']} open, CI {ci_state(pr['statusCheckRollup'])}"
        elif pr:
            text = f"PR #{pr['number']} closed without merging"
        elif branch:
            text = f"in progress ({branch})"
        elif waiting:
            text = f"waiting for {', '.join(waiting)}"
        else:
            text = "not started"
        lines.append(f"{part}  {text}")
    if prs is None:
        return lines + ["gh failed, so merged parts can't be told apart: no next actions"]
    if len(merged) == len(rows):
        return lines + ["Next:", "  all parts merged: finish the feature"]
    nxt = []
    start = [p for p, _, needs in rows if found[p] == (None, None, None) and set(needs) <= merged]
    if start:
        nxt.append(f"start: {', '.join(start)}")
    first = next(p for p, _, _ in rows if p not in merged)
    pr, state, _ = found[first]
    if state == "OPEN":
        nxt.append(f"merge next: {first} (#{pr['number']}, CI {ci_state(pr['statusCheckRollup'])})")
    elif state != "CLOSED":
        nxt.append(f"merge waits for {first}")
    nxt += [f"ask the user: {p}'s PR #{pr['number']} was closed without merging"
            for p, (pr, state, _) in found.items() if state == "CLOSED"]
    return lines + ["Next:"] + [f"  {n}" for n in nxt]


def list_branches(cwd):
    """Local branch names, then `origin/<name>` ones."""
    out = git(cwd, "for-each-ref", "--format=%(refname:lstrip=2)", "refs/heads", "refs/remotes/origin") or ""
    return [b for b in out.split() if b != "origin/HEAD"]


def list_prs(cwd, since=None):
    """gh's PRs (created since the day before `since`, a YYYY-MM-DD date, when given: GitHub dates are
    UTC, the plan's is local), or None (after a message on stderr) when gh fails or returns a full page,
    which may leave out a merged part's PR."""
    cmd = ["gh", "pr", "list", "--state", "all", "--limit", str(GH_LIMIT), "--json", GH_FIELDS]
    if since:
        cmd += ["--search", f"created:>={date.fromisoformat(since) - timedelta(days=1)}"]
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
    except OSError as e:
        print(f"gh failed: {e}", file=sys.stderr)
        return None
    if r.returncode != 0:
        print(f"gh failed: {r.stderr.strip()}", file=sys.stderr)
        return None
    prs = json.loads(r.stdout)
    if len(prs) >= GH_LIMIT:
        print(f"gh failed: {GH_LIMIT} PRs or more, so a merged part's PR may be missing", file=sys.stderr)
        return None
    return prs


def main():
    if len(sys.argv) != 2:
        print(__doc__.split("\n\n")[1], file=sys.stderr)
        return 2
    page = Path(sys.argv[1])
    found = sections(FENCE.sub("", COMMENT.sub("", page.read_text(encoding="utf-8"))))
    split = found.get("Work split")
    if not split:
        print(f"{page}: no work split", file=sys.stderr)
        return 1
    errors = check_split(split)
    if errors:  # a broken table could make a part look ready to start
        print("\n".join(f"{page}: {e}" for e in errors), file=sys.stderr)
        return 1
    cwd = str(page.resolve().parent)
    approved = APPROVED.search(found.get("Approval", ""))
    prs = list_prs(cwd, approved and approved[1])
    print("\n".join(report(page.stem, split_rows(split), list_branches(cwd), prs)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
