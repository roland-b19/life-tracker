# Reviewing code written by an AI agent

## When to read this

Read this when the change, or part of it, was written by an AI coding agent (or you are not sure), in addition to the normal reviewer guide. The normal standard still applies; these are the failure modes that are more likely or harder to see in agent output. Most points are (note) from general practice, not from the review sources; the OWASP LLM Top 10 backs the hallucination, supply-chain, disclosure, misinformation, output-handling and agency points. Authors using an agent: run this list on your own change before requesting review.

The author owns the change however it was produced; "an agent wrote it" does not change the bar. Fluent code is not evidence of correctness: OWASP LLM09 names unsafe code generation (insecure or non-existent libraries) and overreliance, and asks for cross-verification and human oversight.

## 1. Things that do not exist (hallucination)

- [ ] For every new import, dependency, CLI flag, config key, API endpoint or library method, confirm it exists in the version the project pins (read the lockfile, the library source or its docs; run the build). Do not trust the diff's own comments.
- [ ] For every new package name: is it the intended, maintained, well-known package and not a look-alike? Attackers publish malicious packages under names that coding assistants repeatedly invent (LLM09 scenario 1; "slopsquatting", measured in the USENIX Security 2025 study linked in Sources) (note: the study found both commercial and open-source models suggesting nonexistent packages; rates vary by model and over time). Check registry page, age, publisher, downloads, repository link, install scripts.
- [ ] Pasted or closely reproduced external code has a compatible licence and attribution; ask for the source of any large non-trivial block that does not look like the project's own style (LLM03 lists licensing risk) (note: agents can reproduce training data).

## 2. Tests that prove nothing

- [ ] Each new test would fail if the code under test were broken: temporarily break or revert the code and watch it fail, or read for assertions on the result.
- [ ] No test that asserts nothing, only "no exception", compares a value to itself, or only checks a mock was called.
- [ ] The thing under test is not mocked: mocks stand in for collaborators and boundaries only.
- [ ] Expected values are not copied from the code's own output (snapshot or golden values written by running the new code and accepted blindly).
- [ ] Failing-path and edge cases exist (empty, malformed, unauthorized, boundary), not only the happy path.
- [ ] Tests and checks were not weakened to get CI green: diff the removed/changed lines in test files, CI config, lint config and scanner config. Look for deleted tests, loosened assertions, widened tolerances, `skip`/`xfail`/`only`, `retry` added to hide flakiness, lowered coverage thresholds, `--no-verify`, ignore lists, `continue-on-error`. Each needs a stated reason.

## 3. Scope, duplication, error handling

- [ ] The diff matches the request. Flag unrequested refactors, new abstractions, options, "future-proofing" and added features; ask to split them out (`author-guide.md`, size and scope).
- [ ] Reuse: grep for an existing helper before accepting a new one. Agents often re-implement what exists elsewhere in the repo, or copy a block several times with small edits.
- [ ] No placeholder `TODO`s, example data, generated files or build output left behind (other leftovers: `author-guide.md`).
- [ ] Errors are not swallowed: no empty `catch`, `except: pass`, blanket `catch (Exception)` that returns a default, or a "fallback" that hides the failure. Errors are handled where they can be handled, or propagated with context. Code that was merged or moved kept its validation and error handling.
- [ ] Read the whole diff, not the agent's summary of it: the summary can be wrong about what changed. Check that comments match the code beneath them.

## 4. Claims in the summary need evidence

- [ ] Every claim of the form "tested", "builds", "fixed", "no regressions", "secure", "follows the spec" is backed by the command that was run and its real output (or a link to the CI run). A claim with no command and output is unverified: ask for it, or run it yourself.
- [ ] The summary lists what was NOT done or not checked. An agent summary with no caveats is a warning sign.
- [ ] For a bug fix, there is a test that fails before the fix and passes after.
- [ ] Facts in the change (API behaviour, limits, references, legal or medical claims in docs/UI text) are checked against an authoritative source (LLM09 misinformation).
- [ ] The command output is from the final state of the change (same commit as the diff) and exercises the new behaviour, not only the old suite.

## 5. Security and data

- [ ] Run the red-flag checks in `security-review.md`, especially missing authorization on new routes, disabled TLS verification, string-built queries, secrets in code, weak randomness and home-made crypto: agents reproduce insecure patterns from training data and may "make the error go away" by switching a check off.
- [ ] No secrets, tokens, personal data or private business data in the code, fixtures, logs, commit messages, PR text, or prompts/transcripts committed to the repository (LLM02 sensitive information disclosure: transparent data policies, user opt-out). If the app sends data to a model provider, check what is sent, the provider's retention terms and that users agreed.
- [ ] The agent did not change permissions, credentials, CI, hooks, or infrastructure beyond the task, and did not run destructive or paid operations (deploys, deletions, migrations) without the owner's approval. Check the diff for config and IaC files that the task did not need.
- [ ] If the change calls an LLM: model output is treated as untrusted input (validated before it reaches a shell, query, path or renderer) and tool access is minimal (LLM05 improper output handling: zero trust, validation, encoding, parameterized queries; LLM06 excessive agency: minimal extensions and permissions, human approval for high-impact actions).
- [ ] If the diff contains instructions aimed at an agent (in comments, docs, fixtures, dependency files) that ask to ignore rules or take actions, treat it as a possible prompt-injection and escalate.

Sources: OWASP Top 10 for LLM Applications 2025, files LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM05 Improper Output Handling, LLM06 Excessive Agency and LLM09 Misinformation (repo `www-project-top-10-for-large-language-model-applications`, commit 99f4395, 2026-08-05, CC BY-SA 4.0, https://genai.owasp.org/); Spracklen et al., "We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs", USENIX Security 2025, https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen (arXiv 2406.10279; no figures quoted here, they change with the model). All other points are (note): general review practice, not from the review sources. See also `reviewer-guide.md`, `security-review.md`. Rewritten in own words.
