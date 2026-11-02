# OWASP Top 10:2025 with ASVS 5.0 mapping

**When to read this:** as a risk checklist at design review or before release ("which classes of failure did we cover?"), and to find which ASVS 5.0 chapter holds the detailed, testable requirements.
The Top 10 is awareness-level; ASVS is the verification standard (the Top 10 text itself says to adopt ASVS for requirements). Use the ASVS chapters named here for pass/fail checks.
ASVS 5.0 chapters: V1 Encoding and Sanitization, V2 Validation and Business Logic, V3 Web Frontend Security, V4 API and Web Service, V5 File Handling, V6 Authentication, V7 Session Management, V8 Authorization, V9 Self-contained Tokens, V10 OAuth and OIDC, V11 Cryptography, V12 Secure Communication, V13 Configuration, V14 Data Protection, V15 Secure Coding and Architecture, V16 Security Logging and Error Handling, V17 WebRTC.
**Mapping provenance:** "[T]" = ASVS chapter named in the Top 10 text for that entry; "(note)" = derived by us from chapter/section titles, not stated in the source.

## A01:2025 Broken Access Control
What: users can act outside intended permissions (read/modify others' data, privileged functions, forced browsing, IDOR, JWT/cookie tampering, CORS misconfig). SSRF is now rolled into this category.
Defend:
- [ ] Deny by default except public resources; enforce in trusted server-side code, never only in the front end.
- [ ] Implement access control once and reuse it; enforce record ownership in the model; business limits in the domain model.
- [ ] Rate-limit API/controller access; log access-control failures and alert on repeats.
- [ ] Invalidate sessions on logout; keep stateless tokens short-lived (refresh tokens/OAuth revocation for longer).
- [ ] No directory listing, no `.git`/backup files in web roots; minimize CORS.
- [ ] Access-control tests in unit and integration tests.
ASVS: V8 Authorization [T]. (note) also V3.5 browser origin separation (CORS/CSRF), V4 API, V5.3/V5.4 file storage/download (path traversal), V7 session termination.

## A02:2025 Security Misconfiguration
What: insecure or default settings anywhere in the stack (cloud permissions, unneeded features/accounts/ports, default credentials, verbose errors/stack traces, missing security headers).
Defend:
- [ ] Repeatable, automated hardening; dev/QA/prod configured identically with different credentials.
- [ ] Minimal platform: remove unused features, samples, docs, accounts.
- [ ] Review settings and cloud storage permissions as part of patching; verify config automatically in every environment (manual at least annually).
- [ ] Segment components/tenants (containers, security groups/ACLs); send security headers.
- [ ] Central error handling as a backstop against overly informative errors.
- [ ] Use identity federation, short-lived credentials or platform roles instead of static keys in code, config or pipelines.
ASVS: V13 Configuration [T]. (note) also V3.4 browser security headers, V12 secure communication, V16.5 error handling.

## A03:2025 Software Supply Chain Failures
What: compromise or weakness in third-party code, build systems, distribution or update channels (replaces "Vulnerable and Outdated Components"; covers transitive dependencies, CI/CD, IDE extensions, registries). Fewest occurrences in data, highest average exploit/impact.
Defend:
- [ ] Central SBOM including transitive dependencies; continuous inventory and monitoring of CVE/NVD/OSV with SCA tooling and alerts.
- [ ] Get components only from official sources over secure links; prefer signed packages; remove unused dependencies.
- [ ] Choose versions deliberately; patch on a risk-based, timely basis (not monthly/quarterly batches); test compatibility; migrate or virtually patch unmaintained components.
- [ ] Change management for CI/CD config, repos, IDEs/extensions, registries, SaaS integrations; separation of duties (nobody writes code and promotes it to production unreviewed).
- [ ] Harden repo, workstations, build servers, artifacts (provenance, signing, immutable builds, promote artifacts instead of rebuilding), IaC (PRs, version control); MFA and least-privilege IAM everywhere.
- [ ] Staged/canary rollouts so a compromised vendor does not hit everything at once.
ASVS: V15 Secure Coding and Architecture [T] (esp. V15.2 Security Architecture and Dependencies). (note) also V3.6 external resource integrity, V13.3 secrets.

## A04:2025 Cryptographic Failures
What: missing/weak encryption in transit or at rest, weak algorithms/keys/randomness, poor key management, keys in repos, bad certificate validation, downgrade possible.
Defend:
- [ ] Classify data; do not store sensitive data you do not need.
- [ ] TLS 1.2 or higher only, forward-secrecy ciphers, no CBC suites, HSTS; no FTP/STARTTLS for confidential data.
- [ ] Encrypt sensitive data at rest; authenticated encryption only; correct IV/nonce handling (never reuse an IV with a key); no ECB.
- [ ] Passwords: Argon2, yescrypt, scrypt or PBKDF2-HMAC-SHA-512 with salt and work factor (bcrypt only for legacy); never a password directly as a key (use a KDF).
- [ ] CSPRNG for all security randomness; avoid MD5, SHA1, PKCS#1 v1.5, CBC mode.
- [ ] Well-trusted implementations; keys generated randomly, stored in HSM/cloud KMS where possible, rotated; no keys in source.
- [ ] No caching of sensitive responses (CDN, server, Redis).
- [ ] Plan for post-quantum migration (source: high-risk systems ready by end of 2030).
ASVS: V11 Cryptography, V12 Secure Communication, V14 Data Protection [T]. Password rules also in V6.2 (note).

## A05:2025 Injection
What: untrusted input reaches an interpreter (SQL, NoSQL, OS command, ORM, LDAP, expression language, and XSS) and is executed as commands. LLM prompt injection is covered in the OWASP LLM Top 10 (LLM01:2025).
Defend:
- [ ] Keep data and commands separate: safe API / parameterized queries / ORM; stored procedures are not immune if they concatenate.
- [ ] Otherwise: positive server-side validation (not sufficient alone) and context-specific escaping; table/column names cannot be escaped, never take them from users.
- [ ] Review code plus SAST/DAST/IAST and fuzzing of every input (params, headers, URL, cookies, JSON, XML) in CI.
ASVS: the Top 10 text points to "V5 Input Validation and Encoding", which is the ASVS 4.0 chapter name; in 5.0 use V1 Encoding and Sanitization (V1.2 Injection Prevention, V1.3 Sanitization) and V2 Validation and Business Logic [T-adapted]. (note) also V1.5 safe deserialization, V3.2 unintended content interpretation (XSS).

## A06:2025 Insecure Design
What: missing or ineffective control design; a perfect implementation cannot fix a design that never had the control. Root: no business-risk profiling and no secure design process.
Defend:
- [ ] Collect protection requirements (confidentiality, integrity, availability, authenticity), expected business logic, exposure, and tenant separation up front; budget for security.
- [ ] Threat model critical flows (authentication, access control, business logic, key flows) in refinement; see `threat-modeling.md`.
- [ ] Security language in user stories; document flows and failure states and the assumptions behind them.
- [ ] Use paved-road secure components and design patterns; secure SDLC, post-mortems feed back.
- [ ] Plausibility checks at every tier; unit/integration tests for use cases and misuse cases.
- [ ] Segregate tiers (system and network) and tenants robustly.
ASVS: not named in the source. (note) V2 Validation and Business Logic (V2.3 business logic security, V2.4 anti-automation), the `.1 Documentation` section of each chapter, V15.1 documentation, V8.1/V8.2 authorization design.

## A07:2025 Authentication Failures
What: the system accepts an invalid or wrong identity as legitimate (credential stuffing/spraying, brute force, weak or default passwords, weak recovery, missing MFA, session ID exposure/reuse, bad logout, wrong audience).
Defend:
- [ ] MFA wherever possible; no default credentials; support password managers.
- [ ] Check new passwords against a top-10,000 worst list and breached-credential lists (ASVS 6.2.4 L1 floor: top 3000); follow NIST 800-63B section 5.1.1; do not force periodic rotation unless a breach is suspected (then reset immediately).
- [ ] Same message for all outcomes in login, registration and recovery (no account enumeration); no knowledge-based answers.
- [ ] Limit or progressively delay failed attempts without creating a DoS; log failures and alert on attack patterns.
- [ ] Server-side session manager: new high-entropy ID after login, not in the URL, secure cookie, invalidated on logout, idle and absolute timeout.
- [ ] Prefer a well-tested identity system over a home-made one; validate `aud`, `iss` and scopes of tokens.
ASVS: not named in the source. (note) V6 Authentication, V7 Session Management, V9 Self-contained Tokens, V10 OAuth and OIDC, V2.4 anti-automation.

## A08:2025 Software or Data Integrity Failures
What: code or data treated as trusted without integrity checks (untrusted plugins/CDNs, unsigned updates or artifacts, insecure CI/CD, tamperable serialized data / insecure deserialization). Narrower than A03: trust boundaries and artifact integrity.
Defend:
- [ ] Verify signatures or equivalent for software and data from outside.
- [ ] Consume only trusted repositories (vetted internal mirror for higher risk).
- [ ] Review process for code and configuration changes; CI/CD with segregation, configuration control and access control.
- [ ] Never accept unsigned or unencrypted serialized data from untrusted clients without an integrity check (signature) against tampering and replay.
ASVS: not named in the source. (note) V15.2 dependencies, V1.5 safe deserialization, V3.6 external resource integrity, V9.1 token source and integrity.

## A09:2025 Security Logging and Alerting Failures
What: attacks go undetected or unanswered because events are not logged, logs are not protected or monitored, or nothing alerts (title changed from "Monitoring" to "Alerting": logs without alerts have little value).
Defend:
- [ ] Log logins (including failures), access-control failures and server-side validation failures with enough context, retained long enough for forensics.
- [ ] Log every security-control outcome, success or failure; machine-readable format; encode log data to prevent log injection; never log sensitive data (PII, PHI, secrets).
- [ ] Audit trail with integrity (append-only tables or similar) for transactions; logs not only local, backed up.
- [ ] Failed transactions roll back and fail closed.
- [ ] Alert on suspicious behavior with playbooks; tune to avoid alert fatigue; consider honeytokens (access to them is almost always malicious).
- [ ] Have an incident response plan (NIST 800-61r2 or later); do not expose log/alert detail to users.
ASVS: V16 Security Logging and Error Handling [T].

## A10:2025 Mishandling of Exceptional Conditions
What: new in 2025. The program fails to prevent, detect, or properly respond to unusual situations (unchecked errors, failing open, partial transactions, resource exhaustion), leading to logic flaws, races, DoS, bypass.
Defend:
- [ ] Catch and handle errors where they occur (meaningful recovery, user-friendly error, log, alert if justified) and add a global handler as a backstop.
- [ ] Roll back the whole transaction on error and start over: fail closed, never half-recover.
- [ ] Rate limits, quotas, throttling, timeouts: nothing unlimited (prevents DoS, brute force, surprise cloud bills).
- [ ] Strict input validation; centralized, consistent error handling, logging and monitoring (one place, one way); aggregate repeated identical errors as counts.
- [ ] Security requirements, threat modeling or design review, code review/static analysis, and stress/penetration testing for error paths.
ASVS: V16.5 Error Handling [T]. (note) also V15.3 defensive coding, V15.4 safe concurrency (races), V2.4 anti-automation, V16 logging.

## How to use (note)
- Design review: walk A01..A10; for each, name the ASVS chapter you target (e.g. L2) and where the control lives.
- Do not claim "Top 10 compliant": the Top 10 is not a standard; use ASVS levels for verifiable claims.

Sources: OWASP Top 10:2025, `Top10/2025/docs/en/` A01..A10 + 0x00 introduction, git commit 3a31f35 (2026-09-24), CC BY-SA 4.0, https://owasp.org/Top10/2025/. ASVS 5.0 chapter/section names from OWASP/ASVS `5.0/en`, commit 9ccce0e (2026-10-26), CC BY-SA 4.0. Top 10 statements are paraphrased; any mapping marked "(note)" is ours. Check owasp.org for a newer Top 10 edition.
