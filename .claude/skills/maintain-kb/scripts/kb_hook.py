#!/usr/bin/env python3
"""Knowledge-base reminder hook. One script for three hook events (stdin: hook JSON).

PreCompact      -> if there is unrecorded work, stdout becomes extra compaction instructions:
                   keep KB-worthy facts in the summary.
SessionStart    -> source "compact": if work since the KB last changed isn't recorded, tell Claude to run Update.
                   other sources: if an earlier session ended with unrecorded work, tell Claude to offer Update.
SessionEnd      -> if this session has unrecorded work, leave a marker for the next session.

Silent (no output, no tokens) when there is nothing to record. Never fails the session.
"""
import json
import os
import subprocess
import sys
from datetime import datetime

KB = "docs/kb/"
EDIT_TOOLS = {"Write", "Edit", "NotebookEdit"}
PROMPTS_THRESHOLD = 3  # user prompts after the last KB change that count as unrecorded work
# Transcript "user" entries that the app wrote, not the user: slash-command echoes, notifications, interrupts.
NOT_PROMPTS = ("<command-", "<local-command-", "<task-notification", "<bash-", "[Request interrupted")


def kb_changed_at(cwd):
    """Newest modification time of any KB file. It catches KB edits made by any tool or script."""
    latest = 0.0
    for root, _, files in os.walk(os.path.join(cwd, KB)):
        for name in files:
            try:
                latest = max(latest, os.path.getmtime(os.path.join(root, name)))
            except OSError:
                pass
    return latest


def entry_time(d):
    try:
        return datetime.fromisoformat(d["timestamp"].replace("Z", "+00:00")).timestamp()
    except (KeyError, ValueError, AttributeError):
        return None


def unrecorded(transcript, since):
    """Return (edits, prompts) in the transcript that happened after the KB last changed."""
    edits = prompts = 0
    try:
        f = open(transcript, encoding="utf-8")
    except OSError:
        return 0, 0
    with f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            t = entry_time(d)
            if t is None or t <= since:
                continue
            content = (d.get("message") or {}).get("content")
            if d.get("type") == "user" and not d.get("isMeta") and not d.get("isCompactSummary"):
                if isinstance(content, list):
                    content = next((c.get("text") for c in content
                                    if isinstance(c, dict) and c.get("type") == "text"), None)
                if isinstance(content, str) and not content.lstrip().startswith(NOT_PROMPTS):
                    prompts += 1
            elif d.get("type") == "assistant" and isinstance(content, list):
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "tool_use" and c.get("name") in EDIT_TOOLS:
                        inp = c.get("input") or {}
                        if KB not in (inp.get("file_path") or inp.get("notebook_path") or ""):
                            edits += 1
    return edits, prompts


def files_changed_since(cwd, since):
    """Whether a changed or untracked file outside the KB was modified after the KB last changed. It
    catches work the transcript shows no edit for, such as Bash writes and subagents. False without git."""
    try:
        top = subprocess.run(["git", "-C", cwd, "rev-parse", "--show-toplevel"],
                             capture_output=True, timeout=4).stdout.strip()
        status = subprocess.run(["git", "-C", cwd, "status", "--porcelain", "-z", "--untracked-files=all"],
                                capture_output=True, timeout=4).stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
    if not top:
        return False
    kb = os.path.realpath(os.path.join(cwd, KB)) + os.sep  # git prints the real path of the top folder
    old_path_next = False
    for entry in status.split(b"\0"):
        # "XY path"; a rename or copy (X or Y is R or C) is followed by an entry holding the old path alone.
        if old_path_next or not entry:
            old_path_next = False
            continue
        old_path_next = b"R" in entry[:2] or b"C" in entry[:2]
        path = os.path.join(os.fsdecode(top), os.fsdecode(entry[3:]))
        try:
            if not path.startswith(kb) and os.path.getmtime(path) > since:
                return True
        except OSError:  # deleted
            pass
    return False


def has_work(transcript, cwd):
    since = kb_changed_at(cwd)
    edits, prompts = unrecorded(transcript, since)
    return edits > 0 or prompts >= PROMPTS_THRESHOLD or files_changed_since(cwd, since)


def read_marker(marker):
    """The transcripts the marker lists, or [] when it is missing or unreadable."""
    try:
        with open(marker, encoding="utf-8") as f:
            pending = json.load(f)
    except (OSError, ValueError):
        return []
    return pending if isinstance(pending, list) else []


def kb_exists(cwd):
    return os.path.isfile(os.path.join(cwd, KB, "INDEX.md"))


def kb_root(data):
    """The checkout whose KB this session edits, or None: the nearest folder at or above the session's
    cwd that has a KB. In a worktree that is the worktree, which CLAUDE_PROJECT_DIR may not name, and
    after a cd into a subfolder it is still the checkout root. CLAUDE_PROJECT_DIR is the fallback for a
    cwd outside the checkout, such as an added working directory."""
    folder = os.path.abspath(data.get("cwd") or os.getcwd())
    while True:
        if kb_exists(folder):
            return folder
        parent = os.path.dirname(folder)
        if parent == folder:
            project = os.environ.get("CLAUDE_PROJECT_DIR")
            return project if project and kb_exists(project) else None
        folder = parent


def say_context(text):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": text}}))


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    event = data.get("hook_event_name")
    transcript = data.get("transcript_path") or ""
    cwd = kb_root(data)
    if not cwd:
        return
    marker = os.path.join(os.path.dirname(transcript), "kb-pending.json") if transcript else ""

    if event == "PreCompact":
        if not has_work(transcript, cwd):
            return
        print("Knowledge base: keep in the summary every decision (with its reason and rejected "
              "alternatives), user correction or preference, domain or product fact, and open "
              "question not yet written to docs/kb.")

    elif event == "SessionStart" and data.get("source") == "compact":
        if has_work(transcript, cwd):
            say_context(
                "Context was just compacted. Before continuing, run the maintain-kb Update for the "
                "work since the last KB update, using the summary. For details the summary lost, "
                f"search the full pre-compaction transcript: {transcript}"
            )

    elif event == "SessionStart":
        if not marker or not os.path.isfile(marker):
            return
        pending = [p for p in read_marker(marker) if isinstance(p, str) and os.path.isfile(p)]
        try:
            os.remove(marker)  # read once, even when unreadable, so a bad marker can't repeat
        except OSError:
            pass
        if pending:
            say_context(
                "An earlier session ended without updating the knowledge base. In your first reply, "
                "tell the user and offer to run the maintain-kb Update from its transcript: "
                + ", ".join(pending)
            )

    elif event == "SessionEnd":
        if not marker or not has_work(transcript, cwd):
            return
        pending = read_marker(marker)
        if transcript not in pending:
            pending = (pending + [transcript])[-3:]
        with open(marker, "w", encoding="utf-8") as f:
            json.dump(pending, f)


if __name__ == "__main__":
    try:
        main()
    except Exception:  # a reminder must never break a session
        pass
