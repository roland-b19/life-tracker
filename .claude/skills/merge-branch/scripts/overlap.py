#!/usr/bin/env python3
"""List the files that this branch changes and that other work changes too.

Usage: python3 overlap.py [<target>]   (default: the remote's default branch, such as origin/main)

This branch's files are its commits since its merge-base with the target, plus its uncommitted
changes. Other work is:
- the target's commits since that merge-base (merge the target in to take them now), and
- every other worktree of the repo: its commits since its own merge-base with the target, plus
  its uncommitted changes (work in progress in another session).
Routine KB files, which merge-branch resolves at every merge, are listed apart.
Read-only and offline: run `git fetch origin` first for an up-to-date target. Always exits 0.
The guard hook imports this module: status_entries() for its Bash check, other_work() to warn on
the first edit of a shared file. review-change's risk_tier.py imports resolve() and changed(), so the
tier and this report read a change the same way.
"""
import os
import subprocess
import sys

# Every change touches these; merge-branch's "Bring the branch up to date" (SKILL.md step 3.3) resolves
# them at each merge. Keep the two lists the same.
ROUTINE = ("docs/kb/decisions/", "docs/kb/status.md", "docs/kb/INDEX.md", "docs/kb/log/")


class NoTarget(Exception):
    pass


def git(cwd, *args):
    # cwd can be a folder a command `cd`s into: never run a program its git config names (fsmonitor).
    r = subprocess.run(["git", "-C", cwd, "-c", "core.fsmonitor=false", *args],
                       capture_output=True, text=True, check=False)
    return r.stdout if r.returncode == 0 else None


def is_routine(path):
    return any(path == r or (r.endswith("/") and path.startswith(r)) for r in ROUTINE)


def default_target(cwd):
    out = git(cwd, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
    return out.strip() if out else None


def status_entries(cwd):
    """(XY status, path) for every changed or untracked, not ignored file; a rename's old path has XY "".

    Each entry is "XY path"; a rename or copy (R or C in XY) is followed by an entry holding the old path alone.
    """
    entries = (git(cwd, "status", "--porcelain=v1", "-z", "--untracked-files=all") or "").split("\0")
    result, old_path_next = [], False
    for entry in filter(None, entries):
        result.append(("", entry) if old_path_next else (entry[:2], entry[3:]))
        old_path_next = not old_path_next and ("R" in entry[:2] or "C" in entry[:2])
    return result


def uncommitted(cwd):
    """Every changed or untracked, not ignored file, both paths of a rename included."""
    return {path for _, path in status_entries(cwd)}


def committed(cwd, target, head="HEAD"):
    """Files changed by head's commits since its merge-base with the target, both paths of a rename included."""
    return set((git(cwd, "diff", "--name-only", "--no-renames", f"{target}...{head}") or "").split("\n")) - {""}


def changed(root, target):
    """This branch's files: its commits since the merge-base with the target, plus uncommitted changes."""
    return committed(root, target) | uncommitted(root)


def resolve(cwd, target=None):
    """(work tree root, target ref) for cwd; raises NoTarget when either is missing."""
    root = (git(cwd, "rev-parse", "--show-toplevel") or "").strip()
    if not root:
        raise NoTarget("not in a git work tree")
    target = target or default_target(root)
    if not target or git(root, "rev-parse", "--verify", "--quiet", target) is None:
        raise NoTarget(f"no target branch found ({target or 'origin/HEAD is not set'})")
    return root, target


def worktrees(cwd):
    """(path, branch or None) for every worktree whose folder still exists."""
    result, path, branch = [], None, None
    for line in (git(cwd, "worktree", "list", "--porcelain") or "").split("\n") + [""]:
        if line.startswith("worktree "):
            path, branch = line[len("worktree "):], None
        elif line.startswith("branch "):
            branch = line[len("branch "):].removeprefix("refs/heads/")
        elif not line and path:
            if os.path.isdir(path):
                result.append((path, branch))
            path = None
    return result


def other_work(root, target):
    """(name, label, files) for the target since this branch's merge-base, and for every other worktree."""
    others = [(target, f"on {target} since this branch started", committed(root, "HEAD", head=target))]
    me = os.path.realpath(root)
    for path, branch in worktrees(root):
        if os.path.realpath(path) == me:
            continue
        files = committed(path, target) | uncommitted(path)
        others.append((branch or path, f"by {branch or 'a detached HEAD'} in {path}", files))
    return others


def report(root, target):
    mine = changed(root, target)
    shared, routine = [], {}
    for name, label, files in other_work(root, target):
        both = sorted(mine & files)
        plain = [f for f in both if not is_routine(f)]
        if plain:
            shared.append(f"- changed {label}: " + ", ".join(plain))
        for f in set(both) - set(plain):
            routine.setdefault(f, []).append(name)
    lines = ["Files this branch changes that other work changes too:", *shared] if shared else \
        [f"No overlap with {target} or other worktrees."]
    if routine:
        lines.append("Routine KB files, which merge-branch resolves: "
                     + "; ".join(f"{f} ({', '.join(who)})" for f, who in sorted(routine.items())))
    return "\n".join(lines)


def main(argv):
    try:
        root, target = resolve(os.getcwd(), argv[0] if argv else None)
    except NoTarget as e:
        print(f"overlap: {e}")
        return 0
    print(report(root, target))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
