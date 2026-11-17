---
name: find-or-build-tool
description: Finds an existing tool (MCP server, CLI, plugin or skill) or proposes building one when a task can't be done with the current tools or access. Use when you are blocked by a missing capability ("I can't access X"), or when the user asks to find or build a tool or MCP server.
---

# Find or build a tool

Being blocked is never the end of a task. Find a tool that closes the gap, or propose one to build, and let the user choose.

## Limits (always)
- **Search freely; install or build only after the user says yes.** Installing runs someone else's code with this machine's access.
- **Free only.** Recommend only options with no risk of a bill: no card on file, and no usage that can turn into charges. Leave paid and card-required options out unless the user asked for paid options in this project. If only a paid option would work, say so in one line and ask whether to show it.
- **Accounts:** you may propose a tool that needs an account. The user approves each account and always enters passwords, keys and verification codes themselves.
- **Official vendor tools** (published by the company behind the service) may be recommended freely. **Community tools** need a source review (step 3) and the user's approval.
- **Data access is read-only.** For databases, logs, analytics and chat tools, use a read-only user or token, on a copy or replica of production data when one exists. Write access needs the user's yes for that tool.

## Steps

1. **Confirm the gap.** Check what's already available: loaded and deferred tools, connected MCP servers, the project's skills, the CLIs installed on this machine (`command -v <name>`), and the project's `tools/` folder. If one of them can do it, use it and stop here.

2. **Search for an existing tool**, in this order:
   1. The vendor's own MCP server, CLI or API (their docs or GitHub organisation).
   2. The MCP registry (registry.modelcontextprotocol.io) and Claude Code plugin marketplaces, plus any registry or plugin search tool this session has.
   3. GitHub and package registries (npm, PyPI) for community tools.

3. **Vet each candidate.** Note who maintains it, when it was last updated, its license and what access it needs. For a community tool, read the source before recommending it. If its source is over 2,000 lines, read the parts that matter: install and postinstall scripts, what it can access (files, shell, browser), where it sends data, and how it handles credentials. Then tell the user exactly what you read and what you didn't. Drop anything that sends data somewhere unexplained or asks for more access than the task needs.

4. **If nothing fits, design the cheapest tool that works:**
   - a script inside the skill that needs it (for a mechanical step)
   - a CLI script in `tools/<name>/` (for something used from several places)
   - an MCP server in `tools/<name>/`, registered in the project's `.mcp.json` (when Claude needs it as a tool in every session)

   Built tools live in this project's codebase, never in a separate repo.

5. **Present 2–3 options** (existing or to build). For each, give what it does, its source (official, community and what you reviewed, or to be built), the access and accounts it needs, and its tradeoffs. Then give your recommendation. Wait for the user's choice.

6. **Install or build the chosen option.** Keep its config in the project (`.mcp.json`, `tools/`), not in user-level settings, so a fresh agent has it too. Connect only the MCP servers this project uses, because each one adds its tools to the context. Never put secrets in the repo: read them from environment variables, and tell the user which variables to set.

7. **Verify** by finishing the original task with the new tool. If it fails, fix it or go back to step 5.

8. **Record it** through maintain-kb Update, including the one way to use it on the conventions page. For a data tool, that includes these rules, which keep the context small:
   - use it only when the task needs that data
   - ask for small results: filters, time windows, `LIMIT`, only the fields needed
   - send a read that could return a lot to a subagent that returns only the conclusion
