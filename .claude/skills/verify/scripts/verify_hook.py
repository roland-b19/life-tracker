#!/usr/bin/env python3
"""Stop hook: run the project's fast checks when the code changed since they last passed.

Usage in .claude/settings.json:  python3 verify_hook.py <the one check command and its arguments>
stdin: the Stop hook JSON.

- The git working state (HEAD plus every changed or untracked file's content) is the same as after
  the last green run -> exit 0, silent: nothing to check.
- The checks pass -> remember the state, exit 0, silent.
- The checks fail -> print the end of their output to stderr and exit 2, so Claude keeps working.
  Only once per failing state: if Claude stops again without changing anything (for example to ask
  the user), it may stop.
Outside a git repo, without a command, or on any error of its own, it stays out of the way (exit 0).
State is kept next to the session transcripts, never in the repo.
"""
import hashlib
import json
import os
import shlex
import subprocess
import sys

TAIL_CHARS = 4000  # end of the failing output handed to Claude


def git(root, *args):
    return subprocess.run(["git", "-C", root, *args], capture_output=True, check=False).stdout


def fingerprint(root):
    """Hash of HEAD plus the path, status and content of every changed or untracked, not ignored file."""
    h = hashlib.sha256(git(root, "rev-parse", "HEAD"))
    old_path_next = False
    for entry in git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all").split(b"\0"):
        if not entry:
            continue
        h.update(entry + b"\0")
        # "XY path"; a rename or copy (X or Y is R or C) is followed by an entry holding the old path alone.
        path, old_path_next = (entry, False) if old_path_next else (entry[3:], b"R" in entry[:2] or b"C" in entry[:2])
        full = os.path.join(root, os.fsdecode(path))
        if os.path.isfile(full):
            file_hash = hashlib.sha256()
            with open(full, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):  # in chunks: big files stay out of memory
                    file_hash.update(chunk)
            h.update(file_hash.digest())
    return h.hexdigest()


def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def save(path, state):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f)
    except OSError:
        pass


def main():
    command = sys.argv[1:]
    data = json.load(sys.stdin)
    transcript = data.get("transcript_path") or ""
    root = git(data.get("cwd") or os.getcwd(), "rev-parse", "--show-toplevel").decode().strip()
    if not command or not transcript or not root:
        return 0
    state_file = os.path.join(os.path.dirname(transcript), "verify-state.json")
    state = load(state_file)
    mine = state.get(root) if isinstance(state.get(root), dict) else {}

    if fingerprint(root) in (mine.get("green"), mine.get("failed")):
        return 0
    shown = shlex.join(command)
    try:
        r = subprocess.run(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True, errors="replace", check=False)
    except OSError as e:
        sys.stderr.write(f"Verify hook: could not run the fast checks ({shown}): {e}\n")
        return 0
    after = fingerprint(root)  # the run may write files of its own, such as reports
    if r.returncode == 0:
        state[root] = {"green": after}
        save(state_file, state)
        return 0
    state[root] = {"green": mine.get("green"), "failed": after}
    save(state_file, state)
    sys.stderr.write(
        f"The fast checks fail (`{shown}`, exit {r.returncode}). Fix them before you finish, "
        "or tell the user why they can't pass yet. Never weaken a test to make it pass. "
        f"End of the output:\n{r.stdout[-TAIL_CHARS:]}\n"
    )
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # a broken hook must never trap a session
        sys.exit(0)
