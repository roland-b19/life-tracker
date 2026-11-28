#!/usr/bin/env python3
"""Mechanical checks for a markdown knowledge base.

Prints only problems plus one summary line, to keep token cost low.
Exit code 1 if there are errors.

Checks: INDEX exists and is under its line cap; every page is reachable from
INDEX; no broken relative links; pages have summary/last_verified frontmatter;
pages over the size cap (errors); stale last_verified; covered code committed after
last_verified (git); a decision number used twice; leftover merge conflict
markers; template placeholders such as <Title> left in a page's prose; pages under plans/ pass the plan checks of the
plan-feature skill (its scripts/check_plan.py).
"""
import argparse
import datetime as dt
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
FENCE = re.compile(r"```.*?```", re.S)
INLINE_CODE = re.compile(r"`[^`\n]*`")
# COMMENT, FENCE, INLINE_CODE and placeholders are also used by plan-feature/scripts/check_plan.py;
# COMMENT and is_decision_file by the workflow repo's installer (setup/setup.py there).
COMMENT = re.compile(r"<!--.*?-->", re.S)
DECISION = re.compile(r"^## D-(\d+):", re.M)
CONFLICT = re.compile(r"^(<<<<<<<|>>>>>>>) ", re.M)  # "=======" alone is also a markdown heading underline
# A template placeholder such as <Title>. An autolink such as <https://…> or <me@example.com> is not one,
# and an HTML tag GitHub renders, such as <details> or <img src=x>, is not one either.
HTML_TAG = (r"(?i:details|summary|br|hr|sub|sup|kbd|b|i|em|strong|code|pre|p|div|span|img|a|ins|del|"
            r"table|thead|tbody|tr|td|th|ul|ol|li|blockquote|h[1-6]|picture|source)"
            r"(?:\s+(?:open|[a-zA-Z-]+=(?:\"[^\"\n]*\"|'[^'\n]*'|[^\s\"'<>=`]+)))*\s*/?>")
PLACEHOLDER = re.compile(rf"<(?![a-zA-Z][a-zA-Z0-9+.-]*:)(?![^<>\s@]+@[^<>\s]+>)(?!{HTML_TAG})[a-zA-Z][^<>\n]*>")


def placeholders(prose):
    """The template placeholders left in prose that has its comments, fences and inline code removed."""
    return sorted(set(PLACEHOLDER.findall(prose)))


PLANS = "plans"  # feature plan pages, written by the plan-feature skill
INDEX_MAX, PAGE_MAX = 60, 250  # caps from maintain-kb SKILL.md rule 6
STALE_DAYS = 60  # a page whose last_verified is older than this many days gets a warning


def is_decision_file(rel):
    """True for a page that holds decisions, by its path relative to the KB folder: one page per area
    in decisions/."""
    parts = rel.split("/")
    return len(parts) == 2 and parts[0] == "decisions" and parts[1].endswith(".md")


def frontmatter(text):
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    fm = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            fm[key.strip()] = value.strip()
    return fm


@lru_cache(maxsize=None)
def plan_check():
    """plan-feature's check(text), or None when that skill isn't installed."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "plan-feature/scripts"))
    sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folders
    try:
        from check_plan import check
    except ImportError:
        return None
    return check


def git(args, cwd):
    try:
        r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("kb", help="path to the knowledge base folder, e.g. docs/kb")
    a = ap.parse_args()

    kb = Path(a.kb).resolve()
    index = kb / "INDEX.md"
    if not index.is_file():
        print(f"ERROR {a.kb}/INDEX.md: missing")
        print("kb_check: 1 errors, 0 warnings")
        return 1

    errors, warns = [], []
    today = dt.date.today()
    repo = git(["rev-parse", "--show-toplevel"], kb)
    files = sorted(kb.rglob("*.md"))
    links = {}
    decided = {}

    for p in files:
        rel = p.relative_to(kb).as_posix()
        text = p.read_text(encoding="utf-8")
        lines = text.count("\n") + (0 if text.endswith("\n") else 1)

        uncommented = COMMENT.sub("", text)  # comments hold examples, such as the decision entry format

        if CONFLICT.search(text):
            errors.append(f"ERROR {rel}: merge conflict markers left in the page")
        if is_decision_file(rel):
            for n in DECISION.findall(uncommented):
                d = f"D-{n}"
                if d in decided:
                    errors.append(f"ERROR {rel}: decision {d} also in {decided[d]}; renumber one by hand")
                else:
                    decided[d] = rel

        prose = INLINE_CODE.sub("", FENCE.sub("", uncommented))
        targets = set()
        for t in LINK.findall(prose):
            if t.startswith("#") or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", t):
                continue
            dest = (p.parent / t.split("#")[0]).resolve()
            if not dest.exists():
                errors.append(f"ERROR {rel}: broken link -> {t}")
            elif dest.suffix == ".md":
                targets.add(dest)
        links[p] = targets

        if rel.split("/")[0] != PLANS:  # plan pages get this from the plan checks
            errors += [f"ERROR {rel}: template placeholder {m} left (fill it in, or put literal text in backticks)" for m in placeholders(prose)]

        if p == index:
            if lines > INDEX_MAX:
                errors.append(f"ERROR INDEX.md: {lines} lines > {INDEX_MAX}; move detail into pages or section indexes")
            continue

        if rel.split("/")[0] == PLANS:
            if plan_check() is None:
                errors.append(f"ERROR {rel}: plan pages need the plan-feature skill's scripts/check_plan.py")
            else:
                errors += [f"ERROR {rel}: {e}" for e in plan_check()(text)]

        fm = frontmatter(text)
        for key in ("summary", "last_verified"):
            if not fm.get(key):
                errors.append(f"ERROR {rel}: frontmatter missing '{key}'")
        if lines > PAGE_MAX:
            errors.append(f"ERROR {rel}: {lines} lines > {PAGE_MAX}; split by subtopic")

        lv = fm.get("last_verified")
        if not lv:
            continue
        try:
            verified = dt.date.fromisoformat(lv)
        except ValueError:
            errors.append(f"ERROR {rel}: last_verified '{lv}' is not YYYY-MM-DD")
            continue
        age = (today - verified).days
        if age > STALE_DAYS:
            warns.append(f"WARN {rel}: last verified {age} days ago; re-verify")
        covers = [c.strip() for c in fm.get("covers", "").split(",") if c.strip()]
        if covers and repo:
            specs = [f":(glob){c}" for c in covers]
            since = (verified + dt.timedelta(days=1)).isoformat()
            changed = git(["log", "-1", "--format=%cs", f"--since={since}", "--", *specs], repo)
            if changed:
                warns.append(f"WARN {rel}: covered code committed on {changed}, after last_verified {lv}; re-verify")

    seen, stack = set(), [index]
    while stack:
        p = stack.pop()
        if p not in seen:
            seen.add(p)
            stack.extend(links.get(p, ()))
    for p in files:
        rel = p.relative_to(kb).as_posix()
        if p not in seen:
            errors.append(f"ERROR {rel}: not reachable from INDEX.md; add it to the index")

    for msg in errors + warns:
        print(msg)
    print(f"kb_check: {len(errors)} errors, {len(warns)} warnings ({len(files)} files)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
