#!/usr/bin/env python3
"""Mechanical checks for feature plan pages (docs/kb/plans/*.md).

maintain-kb's kb_check runs check() on every page under plans/, so the one check
command covers plans; run this script on a single page for quick feedback.
Prints only problems plus one summary line. Exit code 1 if there are errors.

Checks: the required sections exist and are not empty; no unfinished markers
(TBD, TODO, ???) or template placeholders such as <feature>; done criteria are
checkboxes; every step names its files and tests; the status line is valid; a
work split has two or more parts, no file owned by two parts, and each part needs
only parts listed above it (the rows are in merge order).
"""
import argparse
import re
import sys
from pathlib import Path

# The page format is maintain-kb's, so a plan's prose is read the way kb_check reads every page.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "maintain-kb/scripts"))
sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folders
from kb_check import COMMENT, FENCE, INLINE_CODE, placeholders  # noqa: E402

REQUIRED = ("Goal", "Scope", "Done criteria", "Decisions", "Steps", "Cleanup and docs", "Approval")
SECTION = re.compile(r"^## (.+?)\s*$", re.M)
MARKER = re.compile(r"\bTBD\b|\bTODO\b|\?\?\?")
STEP = re.compile(r"^\d+\. .*(?:\n[ \t]+\S.*)*", re.M)  # a numbered line plus its indented continuation lines
CHECKBOX = re.compile(r"^- \[[ xX]\] ", re.M)
STATUS = re.compile(r"^Status: (draft|approved \d{4}-\d{2}-\d{2}|done \d{4}-\d{2}-\d{2})\s*$", re.M)
NO_DEPS = {"", "-", "—", "none"}


def sections(text):
    """{heading: body} for each `## ` section of text that has comments and fences removed."""
    parts = SECTION.split(text)
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}


def owned_overlap(a, b):
    """True when two owned paths are the same file or one is a folder holding the other."""
    a, b = a.rstrip("/"), b.rstrip("/")
    return a == b or a.startswith(b + "/") or b.startswith(a + "/")


def split_rows(body):
    """The work split's parts, in table order, as (part, owned paths, needed parts).

    A row with fewer than 4 columns gives None for its needed parts."""
    rows = [[c.strip() for c in line.strip().strip("|").split("|")]
            for line in body.splitlines() if line.strip().startswith("|")]
    rows = [r for r in rows[1:] if not set("".join(r)) <= set("-: ")]  # drop the header and separator
    parts = []
    for row in rows:
        owns = re.findall(r"`([^`]+)`", row[2]) if len(row) > 2 else []
        needs = None if len(row) < 4 else [d.strip() for d in row[3].split(",") if d.strip().lower() not in NO_DEPS]
        parts.append((row[0], owns, needs))
    return parts


def check_split(body):
    """Errors in a work split table."""
    rows = split_rows(body)
    if len(rows) < 2:
        return ["work split has fewer than two parts; remove the section or add parts"]
    errors, parts, claimed = [], set(), []  # claimed: (part, path) for the rows above
    for part, owns, needs in rows:
        if needs is None:
            errors.append(f"work split row '{part}' needs 4 columns: part, steps, owns, needs merged first")
            continue
        if part in parts:
            errors.append(f"work split part {part} is listed twice")
        if not owns:
            errors.append(f"work split part {part} owns no files (write them in backticks)")
        for path in owns:
            errors += [f"work split parts {other} and {part} both own `{o}` / `{path}`"
                       for other, o in claimed if owned_overlap(path, o)]
        errors += [f"work split part {part} needs {dep}, which is not listed above it"
                   for dep in needs if dep not in parts]
        parts.add(part)
        claimed += [(part, path) for path in owns]
    return errors


def check(text):
    """Errors in one plan page."""
    errors = []
    uncommented = FENCE.sub("", COMMENT.sub("", text))
    found = sections(uncommented)
    for name in REQUIRED:
        if name not in found:
            errors.append(f"missing section '## {name}'")
        elif not found[name]:
            errors.append(f"section '## {name}' is empty")
    prose = INLINE_CODE.sub("", uncommented)
    for m in sorted(set(MARKER.findall(prose))):
        errors.append(f"unfinished marker '{m}' left")
    for m in placeholders(prose):
        errors.append(f"template placeholder {m} left")
    if "Done criteria" in found and not CHECKBOX.search(found["Done criteria"]):
        errors.append("done criteria are not '- [ ]' checkboxes")
    steps = STEP.findall(found.get("Steps", ""))
    if "Steps" in found and not steps:
        errors.append("no numbered steps")
    for step in steps:
        missing = [k for k in ("files:", "tests:") if k not in step]
        if missing:
            errors.append(f"step '{step.splitlines()[0][:50]}' lacks {' and '.join(missing)}")
    if not STATUS.search(found.get("Approval", "")):
        errors.append("no valid 'Status: draft | approved YYYY-MM-DD | done YYYY-MM-DD' line under Approval")
    if "Work split" in found:
        errors += check_split(found["Work split"])
    return errors


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pages", nargs="+", type=Path, help="plan pages, e.g. docs/kb/plans/export-csv.md")
    a = ap.parse_args()
    errors = []
    for p in a.pages:
        if not p.is_file():
            errors.append(f"ERROR {p}: not a plan page file")
            continue
        errors += [f"ERROR {p}: {e}" for e in check(p.read_text(encoding="utf-8"))]
    for e in errors:
        print(e)
    print(f"check_plan: {len(errors)} errors ({len(a.pages)} plans)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
