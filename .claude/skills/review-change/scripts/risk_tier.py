#!/usr/bin/env python3
"""Print this change's risk tier (Low, Medium or High) from the paths it changes.

Usage: python3 risk_tier.py [<target>]   (default: the remote's default branch, such as origin/main)

The change is the branch's commits since its merge-base with the target, plus its uncommitted and
untracked files (merge-branch's overlap.py lists them; both paths of a rename count).
The tier lists are the "Risk tiers" entry of the KB conventions page, read from the target's copy so a
change can't lower its own tier; only when the target's page has no entry yet is the working copy read.
The entry is a bullet line starting `- **Risk tiers:**`, followed by lines indented two spaces, among
them `  - **Low:** <globs>` and `  - **High:** <globs>`; the globs are the backticked words on those lines.
In a glob, `**/` matches zero or more folders, a trailing `**` matches everything below, and `*` and `?`
never match `/`.
Tier: High if any path matches a High glob; Low if every path matches a Low glob (or nothing changed);
otherwise Medium.
Prints the tier on line 1, then one line per path that decided it. Exits 1 with a message on stderr when
there is no target, no merge-base, or no usable "Risk tiers" entry.
"""
import os
import re
import sys
from pathlib import Path

# The changed-path listing is overlap's, so the tier and the overlap report read a change the same way.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "merge-branch/scripts"))
sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folder
from overlap import NoTarget, changed, git, resolve  # noqa: E402

CONVENTIONS = "docs/kb/conventions.md"
ENTRY = "- **Risk tiers:**"
TIERS = ("Low", "High")


class TierError(Exception):
    pass


def glob_pattern(glob):
    """A compiled regex for a glob, by the rules in the module docstring."""
    out, i = [], 0
    while i < len(glob):
        if glob.startswith("**/", i):
            out.append("(?:.*/)?")
            i += 3
        elif glob.startswith("**", i):
            out.append(".*")
            i += 2
        elif glob[i] == "*":
            out.append("[^/]*")
            i += 1
        elif glob[i] == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(glob[i]))
            i += 1
    return re.compile("".join(out) + r"\Z")


def parse_entry(text):
    """{"Low": [(glob, regex)], "High": [(glob, regex)]} from the page's "Risk tiers" entry, or None
    when it has none."""
    lines = text.split("\n")
    start = next((i for i, line in enumerate(lines) if line.startswith(ENTRY)), None)
    if start is None:
        return None
    lists = {}
    for line in lines[start + 1:]:
        if not line.startswith("  "):
            break
        for tier in TIERS:
            if line.strip().startswith(f"- **{tier}:**"):
                lists[tier] = [(g, glob_pattern(g)) for g in re.findall(r"`([^`]+)`", line)]
    missing = [tier for tier in TIERS if tier not in lists]
    if missing:
        raise TierError(f"the Risk tiers entry in {CONVENTIONS} has no {' or '.join(missing)} line")
    return lists


def tier_lists(root, target):
    """The tier lists from the target's conventions page, else from the working copy."""
    lists = parse_entry(git(root, "show", f"{target}:{CONVENTIONS}") or "")
    if lists is None:
        path = Path(root) / CONVENTIONS
        lists = parse_entry(path.read_text()) if path.is_file() else None
    if lists is None:
        raise TierError(f"no Risk tiers entry in {CONVENTIONS} (on {target} or in the working copy)")
    return lists


def first_match(path, globs):
    return next((g for g, regex in globs if regex.match(path)), None)


def classify(paths, lists):
    """(tier, reason lines) for the changed paths."""
    if not paths:
        return "Low", ["Low: no changed files"]
    high = [(p, g) for p in paths if (g := first_match(p, lists["High"]))]
    if high:
        return "High", [f"High: {p} matches {g}" for p, g in high]
    low = {p: first_match(p, lists["Low"]) for p in paths}
    medium = [p for p, g in low.items() if not g]
    if medium:
        return "Medium", [f"Medium: {p} is in no list" for p in medium]
    return "Low", [f"Low: {p} matches {g}" for p, g in low.items()]


def compute(cwd, target=None):
    """(tier, reason lines) for the change in cwd's work tree; raises TierError."""
    try:
        root, target = resolve(cwd, target)
    except NoTarget as e:
        raise TierError(str(e)) from None
    if git(root, "merge-base", target, "HEAD") is None:  # committed() would read this as "no commits"
        raise TierError(f"no merge-base between {target} and HEAD")
    paths = sorted(changed(root, target))
    return classify(paths, tier_lists(root, target))


def main(argv):
    try:
        tier, reasons = compute(os.getcwd(), argv[0] if argv else None)
    except TierError as e:
        print(f"risk_tier: {e}", file=sys.stderr)
        return 1
    print("\n".join([tier, *reasons]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
