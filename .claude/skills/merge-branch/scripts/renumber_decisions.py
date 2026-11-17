#!/usr/bin/env python3
"""Renumber the decisions this branch added so they follow the target branch's highest D-number.

Run from the branch's checkout with a clean working tree:
    python3 renumber_decisions.py <target-branch>

A decision is a `## D-NNN:` heading in a decision page of docs/kb: decisions/<area>.md or
archive/decisions.md (kb_check's is_decision_file).
The branch's new decisions (not in the merge base) keep their order and get the numbers after the
target's highest; every `D-NNN` reference to them in tracked text files is rewritten in one pass.
Prints the mapping, or that nothing needed renumbering. Does not commit.
"""
import re
import subprocess
import sys
from pathlib import Path

# The decision parsing is kb_check's, so both scripts read decisions the same way. Its COMMENT strips
# comments, which hold the entry-format example; is_decision_file takes a path relative to docs/kb.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "maintain-kb/scripts"))
sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folder
from kb_check import COMMENT, DECISION, is_decision_file  # noqa: E402

REFERENCE = re.compile(r"\bD-\d+\b")


def git(*args, ok=(0,)):
    r = subprocess.run(["git", *args], capture_output=True, text=True)
    if r.returncode not in ok:
        sys.exit(f"renumber_decisions: git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def decisions(rev):
    """Decision numbers in the decision pages at a revision."""
    found = set()
    for path in git("ls-tree", "-r", "--full-tree", "--name-only", rev, "--", "docs/kb/").splitlines():
        if is_decision_file(path.removeprefix("docs/kb/")):
            text = git("show", f"{rev}:{path}")
            found.update(int(n) for n in DECISION.findall(COMMENT.sub("", text)))
    return found


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: renumber_decisions.py <target-branch>")
    target = sys.argv[1]
    if git("status", "--porcelain").strip():
        sys.exit("renumber_decisions: commit or discard the uncommitted changes first.")
    base = git("merge-base", "HEAD", target).strip()
    shared = decisions(base)
    ours = sorted(decisions("HEAD") - shared)
    top = max(decisions(target) | shared, default=0)
    if not ours or ours[0] > top:
        print("renumber_decisions: nothing to renumber.")
        return
    mapping = {f"D-{old:03d}": f"D-{new:03d}" for new, old in enumerate(ours, start=top + 1)}

    # Tracked text files that mention a renumbered decision; git grep exits 1 when none do.
    words = [arg for old in mapping for arg in ("-e", old)]
    files = [f for f in git("grep", "-lzIwF", "--full-name", *words, ok=(0, 1)).split("\0") if f]
    root = Path(git("rev-parse", "--show-toplevel").strip())
    for rel in files:
        path = root / rel
        text = path.read_text(encoding="utf-8", errors="surrogateescape")  # keeps non-UTF-8 bytes as they are
        new = REFERENCE.sub(lambda m: mapping.get(m.group(0), m.group(0)), text)
        path.write_text(new, encoding="utf-8", errors="surrogateescape")

    for old, new in mapping.items():
        print(f"{old} -> {new}")
    print(f"renumber_decisions: {len(mapping)} decisions renumbered in {len(files)} files.")


if __name__ == "__main__":
    main()
