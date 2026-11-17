#!/usr/bin/env python3
"""Search the knowledge base: ranked sections, read live from the page files.

Usage: kb_search.py [--kb docs/kb] [--top 5] [--history] <words...>

Every run reads the pages as they are now, so there is no stored index to go stale.
Each page is split into sections at its `## ` headings, and the sections are ranked
with BM25. A word in a section's heading counts most, then one in the page's title,
summary or file name, then one in the section text. INDEX.md is skipped (it is always
loaded), and so are log/ and archive/ unless --history is given. Prints the top
sections as `path:line  heading -- page summary` (the summary only with a page's
first result), each followed by its best matching line.
"""
import argparse
import heapq
import math
import re
import sys
from collections import Counter, namedtuple
from functools import lru_cache
from pathlib import Path

# The page format is kb_check's (same folder), so the check and the search read pages the same way.
sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folder
from kb_check import COMMENT, EXEMPT, frontmatter  # noqa: E402

HEADING, PAGE, TEXT = 3, 2, 1  # how much a word counts in a section's heading, its page's names, its text
K1, B = 1.2, 0.75  # standard BM25 constants
WIDTH = 160  # printed lines are cut to this many characters
WORD = re.compile(r"[a-z0-9]+(?:[-_.][a-z0-9]+)*")
PART = re.compile(r"[a-z0-9]+")
STOP = set("""a an and are as at be but by can do does for from has have how i if in into is it
its no not of on or so than that the then there these this to was we were what when where which
who why will with you your""".split())

Section = namedtuple("Section", "path line heading summary body tf length")


def stem(word):
    """Fold plurals so 'indexes' finds 'index' and 'branches' finds 'branch'."""
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if word.endswith(("sses", "xes", "ches", "shes")):  # not -ses or -zes: 'cases' is 'case' plus s
        return word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


@lru_cache(maxsize=None)
def expand(word):
    """The search terms of one lowercased word. A compound such as 'kb_check.py' or 'd-041'
    also yields its parts, so a search for 'kb_check' or '041' finds it."""
    parts = PART.findall(word)
    return tuple(stem(t) for t in ([word] if len(parts) == 1 else [word, *parts])
                 if t not in STOP and len(t) > 1)


def terms(text):
    """Search terms of a text: words lowercased, stemmed, stop words dropped."""
    return [t for word in WORD.findall(text.lower()) for t in expand(word)]


def count(text, weight, tf, wanted):
    """Add the text's wanted terms to tf, each counted `weight` times; return its weighted length."""
    words = Counter(WORD.findall(text.lower()))
    for word, n in words.items():
        for t in expand(word):
            if t in wanted:
                tf[t] += n * weight
    return weight * sum(words.values())


def sections(path, rel, wanted):
    """The sections of one page. The text before the first `## ` heading is a section
    only if it holds more than the page title."""
    raw = path.read_text(encoding="utf-8", errors="replace")  # one bad page must not stop the search
    summary = frontmatter(raw).get("summary", "")
    lines = COMMENT.sub(lambda m: "\n" * m.group().count("\n"), raw).splitlines()  # keeps line numbers
    start = next((i + 1 for i, ln in enumerate(lines[1:], 1) if ln == "---"), 0) if raw.startswith("---\n") else 0
    title_at = next((n for n, ln in enumerate(lines[start:], start + 1) if ln.startswith(("# ", "```", "## "))), None)
    title_at = title_at if title_at and lines[title_at - 1].startswith("# ") else None  # only a title before any fence or section
    title = lines[title_at - 1][2:].strip() if title_at else path.stem
    page_tf = Counter()
    page_length = count(f"{title} {summary} {rel}", PAGE, page_tf, wanted)
    parts, fenced = [(title, title_at or start + 1, [])], False
    for n, line in enumerate(lines[start:], start + 1):
        if line.startswith("```"):
            fenced = not fenced
        if line.startswith("## ") and not fenced:
            parts.append((line[3:].strip(), n, []))
        elif n != title_at:
            parts[-1][2].append((n, line))
    if not any(text.strip() for _, text in parts[0][2]):
        parts.pop(0)
    for heading, line, body in parts:
        tf = page_tf.copy()
        length = page_length + count(heading, HEADING, tf, wanted)
        length += count("\n".join(text for _, text in body), TEXT, tf, wanted)
        yield Section(path, line, heading, summary, body, tf, length)


def search(kb, query, top=5, history=False):
    """The best sections for the query, as (section, best matching line or None) pairs."""
    words = set(terms(query))
    if not words:
        return []
    docs = [s for path in sorted(kb.rglob("*.md"))
            for rel in [path.relative_to(kb).as_posix()]
            if rel != "INDEX.md" and (history or rel.split("/")[0] not in EXEMPT)
            for s in sections(path, rel, words)]
    if not docs:
        return []
    avg = sum(s.length for s in docs) / len(docs)
    df = Counter(t for s in docs for t in s.tf)
    idf = {w: math.log(1 + (len(docs) - df[w] + 0.5) / (df[w] + 0.5)) for w in df}

    def score(s):
        norm = K1 * (1 - B + B * s.length / avg)
        return sum(idf[w] * f * (K1 + 1) / (f + norm) for w, f in s.tf.items())

    best = heapq.nsmallest(top, (s for s in docs if s.tf), key=lambda s: (-score(s), str(s.path), s.line))
    return [(s, best_line(s.body, words)) for s in best]


def best_line(body, words):
    """The section line holding the most query words, or None if none holds any."""
    best, hits = None, 0
    for n, text in body:
        found = len(words.intersection(terms(text)))
        if found > hits:
            best, hits = (n, text.strip()), found
    return best


def cut(text):
    return text if len(text) <= WIDTH else text[:WIDTH - 3] + "..."


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("words", nargs="+", help="what to look for, in plain words")
    ap.add_argument("--kb", default="docs/kb", help="the knowledge base folder (default: docs/kb)")
    ap.add_argument("--top", type=int, default=5, help="how many sections to show (default: 5)")
    ap.add_argument("--history", action="store_true", help="also search log/ and archive/")
    a = ap.parse_args()
    if a.top < 1:
        ap.error("--top must be 1 or more")
    kb = Path(a.kb)
    if not kb.is_dir():
        print(f"kb_search: no knowledge base folder at {a.kb}")
        return 1
    query = " ".join(a.words)
    results = search(kb, query, a.top, a.history)
    if not results:
        more = "" if a.history else ", or add --history"
        print(f"kb_search: nothing matches '{query}'; try other words{more}")
        return 0
    shown = set()  # a page's summary is printed only with its first result
    for s, best in results:
        about = f" -- {s.summary}" if s.summary and s.path not in shown else ""
        shown.add(s.path)
        print(cut(f"{s.path.as_posix()}:{s.line}  {s.heading}{about}"))
        if best:
            print(cut(f"    {best[0]}: {best[1]}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
