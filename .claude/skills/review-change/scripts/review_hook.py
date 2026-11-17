#!/usr/bin/env python3
"""PreToolUse hook on Bash: a pull request body must show its review.

A Bash command that names `gh pr` and the word create, new or edit must be one plain `gh pr` command, with
only `cd <absolute path> &&` allowed before it, so the hook reads its words exactly as bash and zsh pass
them: quotes are fine (with no `$`, backtick or backslash inside double quotes), and nothing in
SHELL_SYNTAX appears outside them. Quotes and backslashes are ignored when spotting such a command, so
`"gh" pr cr''eate` is caught too. stdin: the hook JSON.
Refuses (exit 2, saying what to fix):
- any other command that names them, such as a commit message holding the words (put that text in a file);
- `gh pr create` (or its alias `gh pr new`) with no `--body-file`/`-F` (`--web` and `--editor` included),
  or with `--fill`, `--fill-first`, `--fill-verbose` or `-f`;
- a `--body`/`-b`, or a `--body-file`/`-F` path that is `-`, relative, or can't be read;
- more than one `--body-file`/`-F`, or short flags written together (`-dF`), since gh could then read
  another body file than the hook;
- a body missing one of the sections Summary, Testing, Risk, Review and How to revert (`## ` headings),
  or with one of them empty, or with a template placeholder such as `<one part of the change>` left
  (comments and fenced blocks don't count, as in plan pages);
- a Review section with no table header row naming both Proof and Confidence;
- a Risk section without `Tier: Low|Medium|High`, or with a tier below the one risk_tier.py computes in
  the folder the command runs in (the session's, or the `cd <path>` before it).
A plain `gh pr` command with another verb (view, list, checkout...) passes, and so does a `gh pr edit`
that sets no body. When risk_tier.py can't compute a tier, the tier comparison is skipped. Only the
`gh pr` path imports more than the standard minimum, because the hook runs on every Bash call. On any
error of its own, the hook stays out of the way (exit 0).
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "../../plan-feature/scripts"),  # risk_tier, check_plan
                 os.path.join(HERE, "../../maintain-kb/scripts")]  # kb_check
sys.dont_write_bytecode = True  # leave no __pycache__ in the skill folders

SECTIONS = ("Summary", "Testing", "Risk", "Review", "How to revert")
TIERS = ("Low", "Medium", "High")
VERBS = {"create": "create", "new": "create", "edit": "edit"}  # `gh pr new` is gh's alias for create
FILL = {"--fill", "--fill-first", "--fill-verbose", "-f"}
REPO = {"-R", "--repo"}  # the one `gh pr` flag that takes a value
SHELL_SYNTAX = set(";&|<>()$`\\\n\r#*?[]{}~!^")  # outside quotes, each can change what the shell passes
CD = re.compile(r"[ \t]*cd[ \t]+(/[^\s'\"]*|'/[^']*'|\"/[^\"]*\")[ \t]+&&[ \t]+")
USE_FILE = ("write the body with review-change from merge-branch's assets/pr-body.md, "
            "then pass it as --body-file <absolute path>")
ALONE = ("a command that names `gh pr` with create, new or edit must be just `gh pr create|edit ... "
         "--body-file <absolute path>`, with plain words and only `cd <absolute path> &&` before it; "
         "put text that names it, such as a commit message, in a file")
QUOTING = str.maketrans("", "", "'\"\\")  # removed before spotting the command, as the shell removes them


class NotPlain(Exception):
    pass


def plain_words(text):
    """The words of `text` as bash and zsh both pass them; NotPlain when shell syntax could change them."""
    quote, prev = None, " "
    for c in text:
        if quote == "'":
            quote = None if c == "'" else quote
        elif quote == '"':
            if c in "$`\\":
                raise NotPlain
            quote = None if c == '"' else quote
        elif c in "'\"":
            quote = c
        elif c in SHELL_SYNTAX or (c == "=" and prev in " \t"):  # zsh expands a word starting with `=`
            raise NotPlain
        prev = c
    if quote:
        raise NotPlain
    import shlex  # only commands that name `gh pr` get here; the hook runs on every Bash call
    return shlex.split(text)


def gh_pr_command(command):
    """(verb, args, folder) for a plain `gh pr create|new|edit`, None for a plain `gh pr` with another verb;
    NotPlain for anything else. folder is the `cd` path before it, or ""."""
    folder = ""
    if cd := CD.match(command):
        folder = plain_words(cd.group(1))[0]
        command = command[cd.end():]
    words = plain_words(command)
    if words[:2] != ["gh", "pr"]:
        raise NotPlain
    j = 2
    while j < len(words) and words[j].startswith("-"):
        j += 2 if words[j] in REPO else 1  # `gh pr -R owner/repo create` works too
    if j >= len(words):
        raise NotPlain
    return (VERBS[words[j]], words[j + 1:], folder) if words[j] in VERBS else None


def body_flags(args):
    """(body files, inline body flag, fill flag, a short-flag cluster such as `-dF`): None when absent."""
    body_files, inline = [], None
    fill = cluster = None
    it = iter(args)
    for arg in it:
        if arg in FILL:
            fill = arg
        elif arg == "--body" or arg.startswith("--body="):
            inline = "--body"
        elif arg.startswith("-b"):
            inline = "-b"
        elif arg in ("--body-file", "-F"):
            body_files.append(next(it, ""))
        elif arg.startswith("--body-file="):
            body_files.append(arg[len("--body-file="):])
        elif arg.startswith("-F"):
            body_files.append(arg[2:])
        elif arg[:1] == "-" and arg[1:2] != "-" and len(arg) > 2:
            cluster = arg  # gh reads `-dF x` as `-d -F x`; a value starting with `-` reads as flags too
    return body_files, inline, fill, cluster


def computed_tier(cwd):
    from risk_tier import TierError, compute
    try:
        return compute(cwd)[0]
    except (TierError, OSError):
        return None


def body_problems(body, cwd):
    from check_plan import sections
    from kb_check import COMMENT, FENCE, INLINE_CODE, placeholders
    uncommented = FENCE.sub("", COMMENT.sub("", body))
    found = sections(uncommented)
    problems = [f"the body has no `## {name}` section" if name not in found
                else f"the `## {name}` section is empty" for name in SECTIONS
                if not found.get(name, "").strip()]
    problems += [f"template placeholder {m} left" for m in placeholders(INLINE_CODE.sub("", uncommented))]
    review = found.get("Review", "")
    if not any(line.lstrip().startswith("|") and "Proof" in line and "Confidence" in line
               for line in review.split("\n")):
        problems.append("the Review section has no table with Proof and Confidence columns")
    tier = re.search(r"Tier:\s*\**\s*(Low|Medium|High)\b", found.get("Risk", ""))
    if not tier:
        problems.append("the Risk section has no `Tier: Low|Medium|High` line")
    else:
        needed = computed_tier(cwd)
        if needed and TIERS.index(tier.group(1)) < TIERS.index(needed):
            problems.append(f"the Risk section says Tier: {tier.group(1)}, but risk_tier.py computes {needed}; "
                            f"run review-change at {needed}")
    return problems


def check(verb, args, cwd):
    body_files, inline, fill, cluster = body_flags(args)
    if inline:
        return [f"`{inline}` passes the body inline; {USE_FILE}"]
    if fill and verb == "create":
        return [f"`{fill}` writes the body from the commits, without the review; {USE_FILE}"]
    if cluster:
        return [f"the hook can't tell which flags `{cluster}` holds; write each short flag apart, "
                "and a value that starts with `-` as `--flag=value`"]
    if len(body_files) > 1:
        return [f"pass one --body-file, not {len(body_files)}; {USE_FILE}"]
    if not body_files:
        return [f"`gh pr create` has no --body-file; {USE_FILE}"] if verb == "create" else []
    body_file = body_files[0]
    if not os.path.isabs(body_file):  # `-` (stdin) included
        return [f"the hook can't read the body file `{body_file}`; {USE_FILE}"]
    try:
        with open(body_file, encoding="utf-8") as f:
            body = f.read()
    except OSError:
        return [f"the body file `{body_file}` can't be read; {USE_FILE}"]
    return body_problems(body, cwd)


def main():
    data = json.load(sys.stdin)
    if data.get("tool_name") != "Bash":
        return 0
    command = data.get("tool_input", {}).get("command", "")
    spotted = command.translate(QUOTING)
    if not re.search(r"\bgh\s+pr\b", spotted) or not re.search(r"\b(create|new|edit)\b", spotted):
        return 0
    try:
        found = gh_pr_command(command)
    except NotPlain:
        print(f"review_hook: {ALONE}", file=sys.stderr)
        return 2
    if found is None:
        return 0
    verb, args, folder = found
    problems = check(verb, args, folder or data.get("cwd") or os.getcwd())
    if problems:
        print("review_hook: the PR body must show its review (review-change skill):\n- "
              + "\n- ".join(problems), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # a broken hook must never trap a session
        sys.exit(0)
