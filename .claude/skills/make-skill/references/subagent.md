# Write and test a subagent

Read this at step 5 when step 1 chose a subagent. A subagent is a file `.claude/agents/<name>.md`: frontmatter, then a body that becomes the agent's system prompt. The body rules in make-skill step 5 apply.

## Where the steps live
Every instruction has one home:
- Only the agent runs the steps → write them in the agent's body.
- The main session also runs them, for example as `/<name>` → write them in a skill (step 5). The agent is a thin wrapper with the skill's name: frontmatter with `skills: [<skill-name>]`, which loads the skill's full text into the agent when it starts, and a body that says only what to return (plus the KB pages to read, see `omitClaudeMd`). Never use a skill's `context: fork` option instead.

## Frontmatter
- `name` and `description`: as for a skill, with the name matching the file name and the description saying when Claude should hand work to it. Add "Use proactively" only when Claude should delegate without being asked.
- `tools`: always an explicit list with only the tools the steps use. An agent is read-only when this list has none of Edit, Write, NotebookEdit and Bash (Bash can change files).
- `model`: `inherit`, unless a cheaper model is a reason for the agent. Then use the cheapest model that passes the test below.
- `omitClaudeMd: true` for a read-only agent, to save tokens on every run. Its body then names the KB pages it must read. Any other agent keeps `CLAUDE.md`, so it follows the golden rules.
- Never set `memory`: project facts live in the KB. Never set `permissionMode`: the agent follows the user's own permission settings. Add other fields (`maxTurns`, `effort`, `hooks`, `mcpServers`) only when a step needs them.
- `isolation: worktree` when the agent changes files and may run while another session or agent writes in the same folder: it then works in its own worktree and branch, so neither overwrites the other. The session that started it merges that branch with the merge-branch skill. A read-only agent never needs it.

## Body
- The agent starts with no conversation history: it has only the delegation message, its body, preloaded skills and, unless omitted, `CLAUDE.md`. State the inputs the delegation message must give.
- State the output to return: conclusions with file paths and evidence, not file contents.
- It can't ask the user anything. Say what to do when blocked: stop and report what is missing.

## Test (with make-skill step 6)
- In step 6.1, the fresh reader is the agent itself, with only what the Body section above lists.
- Run the agent once with the Agent tool on the step 6.2 example, and check that its output matches what the body asks for. The first file in a new `.claude/agents/` folder loads only in a new session; if the agent isn't listed yet, ask the user to start one and test it there.
