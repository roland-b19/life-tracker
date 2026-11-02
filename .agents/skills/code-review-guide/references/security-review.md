# Security review of a change

## When to read this

Read this when a change touches a trust boundary, identity, secrets, crypto, parsers, personal data, money, a dependency, infrastructure or a pipeline, or when asked for a "security review". It covers HOW to review a diff for security. For what a secure design must contain, open the `secure-development` references named in section 2; do not re-derive them. Scanners give coverage, but every tool result must be verified by reading the code: tools do not understand context or business logic.

## 1. Scope the review

A diff review checks the change, its effect on existing controls, and new attack paths. Escalate to a baseline (whole codebase) review when a diff reveals a systemic problem.

- [ ] Read what the change is meant to do. Behaviour the description does not mention is suspect.
- [ ] List entry points touched (routes, handlers, queue consumers, CLI args, webhooks, files), trust boundaries crossed (client/server, service/service, app/data store, app/third party) and assets (credentials, tokens, personal data, money, admin or deploy rights).
- [ ] Find the existing controls the change passes through (auth middleware, validators, encoders, rate limits, audit log). A new path around a control is a finding even if the new code is clean.
- [ ] If a threat model exists, check it covers the change; a new entry point, data store, third party or role without a model update is worth a comment (`threat-modeling.md`).
- [ ] Trace data from source (input, upload, API, DB, env var) through processing to sink (query, file, output, log, outbound call, shell). Check validation at every boundary crossing.
- [ ] Spend time by risk, first: authn/authz, crypto and keys, parsers and deserializers, uploads, money or state-changing workflows, personal data, new or bumped dependencies, infra and pipeline files.
- [ ] IaC/secret/dependency scanning in CI (candidates: Checkov, TFLint, Trivy, truffleHog): suggest if absent, do not block (note).
- [ ] No cap on request/page/upload size, loops or retries: resource exhaustion.
- [ ] Each security control added or touched has a test for the failing path (denied, rejected, malformed) (note).

## 2. Red flags in a diff (grep added AND removed lines)

Run each pattern on the changed lines: `git diff -U0 <base> | grep '^[-+]' | grep -iE '<pattern>'`. Patterns are extended regexes (`\b` works in GNU and BSD grep) and hints, not proof: a hit means read the context; adapt to the language. Deleted checks, validators and tests are findings too.

**Input, injection, output, files (`input-api-files.md`)**
- `(select|insert|update|delete) .*(\+ *[a-z_]|\$\{|\{[a-z_]+\})` (concatenation, `${}` or f-string in SQL), `.raw(`: string-built query; bind parameters.
- `(exec|eval|system|popen)\(|shell=true`, backticks with a variable: command/code injection.
- `innerHTML|outerHTML|document\.write|dangerouslySetInnerHTML|v-html|\| *safe|html_safe|mark_safe`: unencoded output, XSS.
- path built from request data, `../` not rejected, user-chosen upload filename: traversal; check size, content-type by content, storage outside web root.
- `pickle\.loads?\(|yaml\.load\(|ObjectInputStream|unserialize\(|BinaryFormatter` (`yaml.load` is fine only with a safe loader), XML parser with DTD/external entities on: code execution or file read.
- HTTP client or redirect target taken from input: SSRF / open redirect; allowlist hosts and schemes.
- request body bound straight to a record (`**request.json`, `Object.assign(model, body)`): mass assignment of role, owner, price; bind explicit fields.
- state change on GET, or CSRF protection removed on cookie-authenticated routes: forged cross-site request.
- validation only client-side, blocklist instead of allowlist, no length limit.

**Authn, sessions, authorization (`identity-access.md`)**
- new route/handler/RPC/job without auth middleware, or in a "public" group: the commonest serious bug; default must be deny.
- fetch by id from the request with no owner/tenant check: IDOR; check every read, update, delete.
- role/admin flag taken from body, cookie or client-editable claim; authorization only in UI or route but not in the service doing the work.
- `alg: none`, token decoded with signature verification off or without expiry or audience check: forgeable identity.
- password `==` compare, MD5/SHA1/plain SHA256 for passwords, home-made password or token code: use an identity provider or a standard slow, salted hash (Argon2id, scrypt, legacy bcrypt, PBKDF2 where FIPS is required; parameters in `identity-access.md`) (note).
- token in URL; cookie without `HttpOnly`/`Secure`/`SameSite`; no invalidation on logout or password change.
- login/reset errors or timing that reveal whether an account exists; no lockout or rate limit; sensitive action without re-authentication.

**Crypto, secrets, TLS, randomness (`platform-data-ops.md`)**
- `grep -iE "(password|passwd|secret|api[_-]?key|token)[a-z_]* *[:=] *[\"'][^\"']{4,}|PRIVATE KEY-----|AKIA[0-9A-Z]{16}"` (quoted literal; PEM key; AWS key id (note)), long base64/hex literals, credentialed connection strings, `.env` or key files added (also fixtures, docs): secret in code; treat as leaked (section 5).
- `verify *= *False|rejectUnauthorized: *false|NODE_TLS_REJECT_UNAUTHORIZED|InsecureSkipVerify: *true|TrustAll|NoopHostnameVerifier`, hostname check off, plain `http://` to an API: man-in-the-middle.
- `md5|sha-?1|\bdes\b|rc4|ecb`, hand-written cipher/hash/padding/token scheme, reused IV/nonce, hardcoded key: use a vetted library and modern algorithms with correct IV/nonce rules for the mode.
- `\brand\(|Math\.random|random\.(random|randint|randrange|choice|choices)\(|new Random\(`, time-seeded values for tokens, ids, reset codes: predictable; use a cryptographically secure generator.

**Errors, logging, data (`platform-data-ops.md`, `privacy-by-design.md`)**
- logging of password, token, `Authorization`, cookie, full request/response bodies, whole user objects, personal or health/finance fields: logs outlive and spread wider than the database.
- stack trace, SQL, internal path or version returned to the client; debug mode on.
- empty `catch`, `except: pass`, ignored error on an auth/crypto/validation call, fail-open fallback: a failed control must deny.
- new personal-data field, analytics/SDK, export or third party with no retention, deletion or inventory entry.
- auth failures and access denials not logged; log lines built from raw user input (log forging).

**Concurrency, business logic, limits (`input-api-files.md` V2.3, `platform-data-ops.md` V15)**
- check-then-act on balance, stock, quota, one-time token, coupon without a transaction, lock or unique constraint: race, double spend.
- later workflow step trusts state sent by the client; step skipping.

**Configuration and dependencies (`platform-data-ops.md`, `supply-chain-and-ci.md`)**
- CORS `*` or reflected origin with credentials; security headers removed; new public, debug, admin or metrics endpoint.
- `nosec|nolint|eslint-disable|NOSONAR|@Ignore|@Disabled|mark\.skip|\.only\(|\.skip\(|\bx(it|describe)\(`, loosened assertions on security tests, scanner or lint rule disabled: a control switched off to get green; require the reason.
- new or bumped dependency, changed lockfile, install scripts, git-URL or unusual registry, name close to a popular one: verify it exists, is the intended package, maintained, licence-compatible, pinned.
- AI/LLM feature: model output into a shell, query, path or renderer unchecked; broad tools; secrets or user data in prompts (`ai-security.md`).

## 3. IaC and pipeline changes

Review them in the same change as the feature they support. Bullets marked (note) go beyond the IaC cheat sheet.

- [ ] **Least privilege:** each widened role, policy, scope or permission (`*` actions/resources, `Owner`/`Admin`-type roles, `write-all`, `0.0.0.0/0`) needs a written reason and a narrower alternative. Prefer workload/managed identity over long-lived keys (note).
- [ ] **Exposure:** data stores, queues, storage and admin interfaces are not publicly reachable: look for public-access flags, open firewall rules, public IPs, anonymous read (note).
- [ ] **Secrets:** none in templates, variable defaults or pipeline files; values from a secret store or protected CI variable; state/plan files not committed and secret outputs marked sensitive (note).
- [ ] **Encryption and logs:** security and audit logs and diagnostics not disabled; at-rest encryption and TLS minimum version kept (note).
- [ ] **Tags and teardown:** new resources carry the required tags so they can be tracked and removed; untagged "ghost" resources cause drift. Change by replacing from code, not editing live resources (immutable infrastructure).
- [ ] **Containers:** image scan result checked; base image pinned and trusted, not root, no baked-in secrets (note).
- [ ] **Pipeline:** artifacts signed at build and verified before use; (note) third-party actions/steps pinned to a commit or digest; minimal workflow permissions; no untrusted text (PR title, branch name, issue body) interpolated into a shell step; no secrets for fork PRs; approvals and required checks on deploy not weakened; security scans not removed, made non-blocking or given wider ignores; artifacts built once.
- [ ] **Plan before apply:** read the plan (created, changed, destroyed). Destroy-and-recreate of a stateful resource risks data loss. Applying real changes needs the owner's explicit OK (note).

## 4. Report a finding

One finding per issue. Put the severity first; Critical and High are blocking issues in the `reviewer-guide.md` section 9 format.

```text
[severity] <vulnerability type> in <component>
Where:    path/file.ext:LINE
Evidence: the added line(s), or command + output
Exploit:  who, with what input, gets what (1-3 sentences, concrete)
Impact:   data/rights/money at risk; prerequisites
Fix:      direction, not a rewrite ("bind parameters", "check owner in service X")
Check:    test that fails before and passes after
```

Severity (note) = likelihood x impact in this project's context: **Critical** (unauthenticated/low-privilege, serious impact: auth bypass, remote code, bulk exposure, live secret; block and consider section 5); **High** (needs a normal account or one prerequisite: IDOR, injection behind login, privilege escalation; block); **Medium** (unusual conditions or limited impact: leak, missing rate limit, weak config; fix now or track with owner and date); **Low/info** (hardening; optional).

- [ ] Do not report an unverified tool alert as a finding. Show the path from source to sink, or write "unconfirmed" and what you could not check.
- [ ] (note) Phrase exploit and impact in terms of this system's assets, not a generic CWE line.
- [ ] (note) Never paste a live secret in a comment: file:line and a masked value.
- [ ] (note) Re-check the fix closes the path without opening another (new bypass, new sensitive log).
- [ ] (note) Accepted risk is a written owner decision (what, why, until when), not a resolved thread.
- [ ] (note) End with: scope reviewed, what was not reviewed, verdict.

## 5. Stop and escalate

(note) Tell the owner at once, before continuing the review, on:

- **A suspected live secret** (key, token, password, private key, connection string) in the diff, history, logs, fixtures or CI output. Deleting it in a later commit is not a fix: it stays in history, forks and caches. Steps: (1) tell the owner; (2) rotate/revoke it at the provider and issue a new one; (3) check provider access logs for use since exposure; (4) then remove it from code, and rewrite history only if the owner decides (never force-push a shared default branch without explicit OK); (5) add secret scanning. Do not test whether the secret works. Detail: `supply-chain-and-ci.md` "Leak response".
- Signs of actual compromise: unexpected outbound calls, backdoor-like or obfuscated code, a dependency that fetches and runs remote code.
- Personal or sensitive data exposed to the wrong audience or sent to a new third party without a decision.
- A critical finding in already-deployed code.
- A request to disable a control "temporarily" on a production path.

If unsure whether something is exploitable, escalate the question with evidence; do not approve on a guess or silently downgrade.

Sources: OWASP Secure Code Review Cheat Sheet and Infrastructure as Code Security Cheat Sheet (Cheat Sheet Series, commit 1abd866, CC BY-SA 4.0, https://cheatsheetseries.owasp.org/); OWASP Code Review Guide `current/chapter_002` methodology sections 2.2-2.3 (tools lack context; review high-risk code in more depth) (commit a3130f6, 2022-06-22, dated; CC BY-SA 4.0, https://owasp.org/www-project-code-review-guide/). That checkout has no per-vulnerability chapters. The cheat sheet gives only three grep examples (secrets, eval/exec/innerHTML, SQL concatenation); the section 2 regexes extend them with general practice (note) and were checked with BSD `grep -E` against Python, JavaScript and Java samples (2026-11-02). Rewritten in own words.
