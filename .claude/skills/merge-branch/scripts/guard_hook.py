#!/usr/bin/env python3
"""Guard rails for parallel sessions: a PreToolUse and PostToolUse hook.

Every writing session works in its own worktree, never in the main folder (the checkout where
`git rev-parse --git-dir` equals `--git-common-dir`), and the brief that starts a session names
the files it owns. stdin: the hook JSON.

- PreToolUse, Edit/Write/NotebookEdit: the file is inside a main folder and git doesn't ignore it
  -> exit 2. Claude is told to call EnterWorktree, or, in a worktree, to use its own path.
- PreToolUse then PostToolUse or PostToolUseFailure, Bash: the main folder's uncommitted changes
  (status, size and modification time of each) are noted before the command and compared after it,
  even when it failed. New or changed entries -> exit 2 after the command, naming them.
- PostToolUse, Edit/Write/NotebookEdit: the first time a session edits a file that the target
  branch or another worktree also changes, Claude gets a heads-up (once per file).
- PreToolUse, start_session (Claude desktop app): a brief with no "Owns:" line, or a session that
  would share this folder (use_worktree false) without "read-only" in that line -> exit 2.
Escape hatch for a user who works alone in the main folder: `git config claude.mainFolderWrites true`
in that clone turns off both main-folder checks. Only the user sets it.
State is kept next to the session transcripts, never in the repo. On any error of its own, the
hook stays out of the way (exit 0).
"""
import glob
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folder
import overlap  # noqa: E402  (same folder)
from overlap import git  # noqa: E402

EDIT_TOOLS = {"Edit": "file_path", "Write": "file_path", "NotebookEdit": "notebook_path"}
START_SESSION = "mcp__ccd_session__start_session"  # also the matcher in assets/hook-settings.json
OWNS = re.compile(r"^[\s>*_-]*owns[*_]*[ \t]*:[ \t]*(\S.*)$", re.IGNORECASE | re.MULTILINE)
MAX_LISTED = 10
HATCH = ("Only the user may turn this check off, in a clone where they work alone, with "
         "`git config claude.mainFolderWrites true`; never set it yourself.")


def repo_of(directory):
    """(top-level folder, True if it is a main folder) for the repo holding directory, or None."""
    out = git(directory, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir",
              "--show-toplevel")
    lines = (out or "").strip().split("\n")
    if len(lines) != 3:
        return None
    git_dir, common, top = (os.path.realpath(p) for p in lines)
    return top, git_dir == common


def main_folder(cwd):
    """The main folder of the repo holding cwd: the folder around the shared git dir, or None."""
    common = (git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir") or "").strip()
    return os.path.realpath(os.path.dirname(common)) if os.path.basename(common) == ".git" else None


def edited_file(data, cwd):
    """(path, repo top, is main folder, path relative to top) for an edit tool's file, or None."""
    path = os.path.realpath(os.path.join(cwd, data["tool_input"][EDIT_TOOLS[data["tool_name"]]]))
    d = os.path.dirname(path)
    while d and not os.path.isdir(d):
        d = os.path.dirname(d)
    repo = repo_of(d)
    return (path, repo[0], repo[1], os.path.relpath(path, repo[0])) if repo else None


def hatch_open(top):
    return (git(top, "config", "--type=bool", "--get", "claude.mainFolderWrites") or "").strip() == "true"


def state_dir(data):
    """parallel-guard/ next to the session transcripts, or None when the input names no transcript."""
    transcript = data.get("transcript_path")
    if not transcript:
        return None
    d = os.path.join(os.path.dirname(transcript), "parallel-guard")
    os.makedirs(d, exist_ok=True)
    return d


def listed(files):
    files = sorted(files)
    more = f" and {len(files) - MAX_LISTED} more" if len(files) > MAX_LISTED else ""
    return ", ".join(files[:MAX_LISTED]) + more


def block(message):
    sys.stderr.write(message + "\n")
    return 2


def check_edit(data, cwd):
    edited = edited_file(data, cwd)
    if not edited or not edited[2]:
        return 0
    path, top, _, rel = edited
    if git(top, "check-ignore", "-q", "--", rel) is not None or hatch_open(top):
        return 0
    mine = repo_of(cwd)
    if mine and not mine[1]:
        return block(f"Blocked: {path} is in the main folder ({top}), but this session works in the "
                     f"worktree {mine[0]}. Write to the same file in your worktree instead: "
                     f"{os.path.join(mine[0], rel)}")
    return block(f"Blocked: this session is in the main folder ({top}), where no session writes files, "
                 "so that parallel sessions never write over each other. Call EnterWorktree now, with a "
                 "short name for the task, and make this change there. " + HATCH)


def snapshot(main):
    """{path: status, size and modification time} for every uncommitted change in the main folder."""
    snap = {}
    for xy, path in overlap.status_entries(main):
        full = os.path.join(main, path)
        if os.path.isfile(full):  # a folder's time changes with its contents, such as a nested repo's
            st = os.stat(full)
            snap[path] = f"{xy} {st.st_size} {st.st_mtime_ns}"
        else:
            snap[path] = xy
    return snap


def bash_state_file(folder, data):
    return os.path.join(folder, f"bash-{data.get('tool_use_id') or 'unknown'}.json")


def before_bash(data, cwd):
    main, folder = main_folder(cwd), state_dir(data)
    if not main or not folder or hatch_open(main):
        return 0
    for old in glob.glob(os.path.join(folder, "bash-*.json")):  # left by interrupted commands
        if os.path.getmtime(old) < time.time() - 86400:
            os.remove(old)
    with open(bash_state_file(folder, data), "w", encoding="utf-8") as f:
        json.dump({"main": main, "snapshot": snapshot(main)}, f)
    return 0


def after_bash(data, cwd):
    folder = state_dir(data)
    state_file = folder and bash_state_file(folder, data)
    if not state_file or not os.path.isfile(state_file):
        return 0
    with open(state_file, encoding="utf-8") as f:
        before = json.load(f)
    os.remove(state_file)
    main = before["main"]
    now = snapshot(main)
    changed = [p for p, v in now.items() if before["snapshot"].get(p) != v]
    gone = [p for p in before["snapshot"] if p not in now]
    if not changed and not gone:
        return 0
    mine = repo_of(cwd)
    where = (f"under your worktree {mine[0]}" if mine and not mine[1]
             else "in a worktree: call EnterWorktree first")
    message = f"This command touched the main folder ({main}), where no session writes."
    if changed:
        message += (f" Changed: {listed(changed)}. If this command made these changes, redo them {where}, "
                    f"then undo only your own changes in the main folder (`git -C {main} checkout -- <file>` "
                    "for a tracked file; delete a new one).")
    if gone:
        message += (f" Uncommitted changes there were discarded or committed: {listed(gone)}. If they were "
                    "your own changes being undone, go on; otherwise tell the user now, because they may "
                    "have been the user's work.")
    return block(message + " If something else did this, such as the user, go on. " + HATCH)


def heads_up(data, cwd):
    folder = state_dir(data)
    edited = edited_file(data, cwd)
    if not folder or not edited or overlap.is_routine(edited[3]):
        return 0
    path, top, _, rel = edited
    seen_file = os.path.join(folder, f"seen-{data.get('session_id') or 'unknown'}.json")
    try:
        with open(seen_file, encoding="utf-8") as f:
            seen = set(json.load(f))
    except (OSError, ValueError):
        seen = set()
    if path in seen:
        return 0
    with open(seen_file, "w", encoding="utf-8") as f:
        json.dump(sorted(seen | {path}), f)
    target = overlap.default_target(top)
    if not target:
        return 0
    hits = [label for _, label, files in overlap.other_work(top, target) if rel in files]
    if not hits:
        return 0
    message = (f"Heads-up: {rel} is also changed {'; and '.join(hits)}. If it changed on {target}, "
               f"merge {target} into this branch now, as merge-branch's \"Bring the branch up to date\" "
               "says. If another session is changing it, keep to the files your brief owns; if you must "
               "change the same part, tell the user, because the PR that merges second must resolve it.")
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": message}}))
    return 0


def check_brief(data):
    ti = data.get("tool_input") or {}
    prompt = ti.get("prompt")
    if not prompt:
        return 0  # an offer card or a proposal being started: the brief was checked when proposed
    owns = OWNS.search(prompt)
    if not owns:
        return block("Add an `Owns:` line to the brief: the files or areas the new session may change, "
                     "for example `Owns: src/api/, tests/api/`, or "
                     "`Owns: nothing (read-only)`. Two writing sessions never own the same files, so "
                     "their changes don't clash. Then call start_session again.")
    # start_session's options that place the new session somewhere other than this folder.
    elsewhere = any(ti.get(k) for k in ("cwd", "host", "preset")) or ti.get("target") == "cloud"
    if ti.get("use_worktree") is False and not elsewhere and not owns.group(1).lower().startswith("nothing"):
        return block("use_worktree false makes the new session share this session's folder (in a worktree, "
                     "its branch and PR too). Only a read-only session may share it: give a writing session "
                     "its own worktree (use_worktree true, or leave it out), or, if it only reads, write "
                     "`Owns: nothing (read-only)`.")
    return 0


def main():
    data = json.load(sys.stdin)
    event, tool = data.get("hook_event_name"), data.get("tool_name")
    cwd = data.get("cwd") or os.getcwd()
    if tool == START_SESSION and event == "PreToolUse":
        return check_brief(data)
    if tool in EDIT_TOOLS and event in ("PreToolUse", "PostToolUse"):
        return check_edit(data, cwd) if event == "PreToolUse" else heads_up(data, cwd)
    if tool == "Bash":
        return before_bash(data, cwd) if event == "PreToolUse" else after_bash(data, cwd)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # a broken hook must never trap a session
        sys.exit(0)
