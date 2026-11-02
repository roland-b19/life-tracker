# Secure development process: NIST SSDF checklist (small team / solo)

**When to read this:** you set up or review HOW software is built and released (repo, CI, reviews, releases, vulnerability handling), not what a single feature does.
Use it to decide which process controls a project needs. Items are the NIST SSDF v1.1 tasks (SP 800-218) rewritten as checks; "Done" lines are our own scaling advice for 1-5 people, marked (note).
SSDF terms: group (PO/PS/PW/RV) > practice (PO.1) > task (PO.1.1). Tasks are only "do this" statements; NIST examples are optional.

**Version status:** v1.1 (Feb 2022) is the text used here. (note) v1.2 is an Initial Public Draft (SP 800-218 Rev. 1, published 2025-12-17, comments closed 2026-01-30) as seen on csrc.nist.gov; this file does not rely on it. Verify at csrc.nist.gov whether a final exists and whether IDs changed.

## Scaling rule (note)
Solo/small team: "organization" = you. "Qualified person not involved" (PW.2.1, PW.7) = a second pair of eyes OR an automated check OR a self-review after a break with a checklist; record which one. Keep proof as repo artifacts (issues, PR descriptions, CI logs, a `SECURITY.md`/`docs/` page), not meetings.

## PO: Prepare the Organization

### PO.1 Define security requirements for software development
- [ ] **PO.1.1** Write down security requirements for your dev infrastructure and process (repo, CI, laptops, third-party/open-source use) and keep them current. (note) Done: one short doc listing them; reviewed at least yearly or after an incident.
- [ ] **PO.1.2** Write down security requirements for the software you produce (architecture/design rules, what must be verified before release, EOL and support policy, what to archive per release, exception process). (note) Done: a security requirements page (e.g. target ASVS level per component) plus an exceptions list with owner and review date.
- [ ] **PO.1.3** State security requirements to third parties whose components you reuse (vendor criteria: disclosure program, provenance data, attestation). (note) Done: dependency/vendor selection criteria written (maintained? advisories? signed releases?).

### PO.2 Roles and responsibilities
- [ ] **PO.2.1** Define who does what across the lifecycle; review periodically; name a code owner per project. (note) Done: CODEOWNERS or a README line.
- [ ] **PO.2.2** Role-based security training for everyone who contributes, reviewed periodically. (note) Done: a reading/practice list per role and a yearly refresh date.
- [ ] **PO.2.3** Get management/authorizing-official commitment to secure development and convey it. (note) Done: solo = you record the commitment (quality gate in "definition of done"); team = a named accountable lead for releases.

### PO.3 Supporting toolchains
- [ ] **PO.3.1** Decide which tools (or tool types) each toolchain must include and how they connect. (note) Typical tool types: SAST, dependency scan, secret scan, SBOM, signing.
- [ ] **PO.3.2** Deploy, run and maintain those tools securely: assess tool security, pipelines/toolchain as code, reproducible builds, update tools, monitor tool logs, verify tool integrity/provenance.
- [ ] **PO.3.3** Configure tools to emit evidence (logs, reports, audit trail) of secure-practice use, with retention rules. (note) Done: CI keeps scan reports/SBOM per run for a defined period.

### PO.4 Criteria for security checks
- [ ] **PO.4.1** Define and track pass/fail criteria for security checks (severity thresholds, KPIs/KRIs, add them to the Definition of Done). (note) Done: e.g. "no unresolved High/Critical finding at release; exceptions recorded".
- [ ] **PO.4.2** Automatically collect and protect the data behind those criteria; restrict who can alter or delete it.

### PO.5 Secure environments
- [ ] **PO.5.1** Separate and protect each environment (dev, build, test, distribution, production): MFA, segmentation, restricted inbound/outbound connections, minimal human access to build services, no production services used from non-production, log and monitor.
- [ ] **PO.5.2** Harden developer endpoints (hardening guide, least privilege/functionality, MFA for endpoints and dev resources, monitor posture, separate dev from general-purpose work where feasible). (note) Done: disk encryption, OS auto-update, MFA on all dev accounts, no shared accounts.

## PS: Protect Software

### PS.1 Protect all forms of code from unauthorized access and tampering
- [ ] **PS.1.1** Keep source, executables and config-as-code in a repository under least privilege; track every change to an individual account; consider signed commits, owner review of others' changes, code signing, file hashes. (note) Done: branch protection on the default branch, MFA, no direct pushes, no secrets in repo.

### PS.2 Release integrity
- [ ] **PS.2.1** Give consumers a way to verify a release: published hashes or signatures from a trusted channel; periodically review signing (cert renewal, rotation, revocation, key protection). (note) Done: if you ship artifacts/images, publish checksums or sign them; if internal-only, sign/pin images by digest.

### PS.3 Archive and protect each release
- [ ] **PS.3.1** Archive release files and supporting data (integrity info, provenance) read-only, per your retention policy.
- [ ] **PS.3.2** Keep provenance data for every component of each release (SBOM, standards-based format); update it whenever a component changes; protect its integrity. (note) Done: CI generates an SBOM (candidates: CycloneDX, SPDX) per release and stores it with the artifact.

## PW: Produce Well-Secured Software

### PW.1 Design to meet requirements and mitigate risks
- [ ] **PW.1.1** Use risk modeling (threat modeling, attack modeling, attack-surface mapping); go deeper for sensitive data, identification, authentication, access control, credential management; use data classification and past vulnerability reports. See `threat-modeling.md`.
- [ ] **PW.1.2** Track security requirements, risks, design decisions, mitigations, and approved exceptions (with periodic re-evaluation). (note) Done: risk register + decision log in the repo.
- [ ] **PW.1.3** Prefer standardized security services (identity, logging, access control, vuln management) over home-made ones; provide secure-config modules as config-as-code.

### PW.2 Design review
- [ ] **PW.2.1** Have a qualified person not involved in the design, and/or automated checks, review the design against requirements and the risk model; designer fixes failures; record findings. (note) Done: design/PR review note linked to the threat model.

IDs moved in v1.1 (no task of their own): PW.3.1 -> PO.1.3; PW.3.2 -> PW.4.4; PW.4.3 -> PW.1.3; PW.4.5 -> PW.4.1 and PW.4.4; PW.5.2 -> PW.5.1.

### PW.4 Reuse well-secured software
- [ ] **PW.4.1** Acquire and maintain vetted third-party components: evaluate for the intended use (re-evaluate if use changes), secure configs, provenance/SBOM, approved-version list, update process keeping old versions until migration ends; if binary provenance cannot be confirmed, build from verified source.
- [ ] **PW.4.2** Build in-house reusable components under the same SDLC rules when no third-party option fits.
- [ ] **PW.4.4** Verify third-party components against your requirements for their whole life: known-vulnerability checks in the toolchain, still-maintained/not-EOL check with a plan for abandoned ones, signature/integrity checks, review code where warranted.

### PW.5 Secure coding
- [ ] **PW.5.1** Follow secure coding practices for your language/environment: validate inputs, validate and encode outputs, avoid unsafe functions, handle errors gracefully, provide logging/tracing, use linters/formatters, self-review to complement (not replace) peer review. See other references in this skill for the rules.

### PW.6 Compiler / interpreter / build configuration
- [ ] **PW.6.1** Use current compiler/interpreter/build tools; apply change management and audit unexpected changes; validate tool authenticity/integrity.
- [ ] **PW.6.2** Decide and enforce secure tool settings: warnings on, warnings-as-errors ("clean build") except justified false positives, builds in a controlled environment, exploit-mitigation flags (e.g. memory randomization) where applicable, config-as-code, verify the config is actually used.

### PW.7 Code review and analysis
- [ ] **PW.7.1** Decide per project/stage whether to use human review, tool analysis, or both (including third-party and internal reusable code).
- [ ] **PW.7.2** Review/analyze against your secure coding standard; log and triage every finding in the issue tracker; peer review with checklists; human triage of tool output; record root causes and lessons. (note) Done: every PR reviewed (or self-reviewed with a checklist if solo) plus SAST in CI; findings become issues.

### PW.8 Test executable code
- [ ] **PW.8.1** Decide whether and what executable testing is needed beyond reviews (sandboxed where appropriate), by stage.
- [ ] **PW.8.2** Scope, design, run and document tests; triage findings in the tracker. Include: functional tests of security features, dynamic testing in the automated suite, regression tests for every past vulnerability, tests that match the production stack, fuzzing for input handling, penetration testing for high-risk areas when resources allow.

### PW.9 Secure by default
- [ ] **PW.9.1** Define a secure baseline: every security-relevant setting has a secure default that does not weaken platform protections; test defaults.
- [ ] **PW.9.2** Implement the defaults and document each setting for administrators (purpose, options, default, security relevance, impact); keep as config-as-code under change control.

## RV: Respond to Vulnerabilities

### RV.1 Identify and confirm vulnerabilities continuously
- [ ] **RV.1.1** Collect vulnerability info from users, acquirers and public sources (advisory databases, mailing lists, SBOM-based matching) for your code and components; investigate every credible report.
- [ ] **RV.1.2** Keep reviewing/testing code (automated analysis on a schedule or continuously for all supported releases) to find undiscovered flaws. See PW.7, PW.8.
- [ ] **RV.1.3** Have a vulnerability disclosure and remediation policy with roles and processes: a way to report, a response team/owner, a playbook (reported vuln, zero-day, exploited in the wild, multi-party incident), occasional exercises.

### RV.2 Assess, prioritize, remediate
- [ ] **RV.2.1** Record each vulnerability in the tracker and analyze risk (exploitability, impact, exposure).
- [ ] **RV.2.2** Decide the response (fix, mitigate, accept, transfer), prioritize, add temporary mitigations while a permanent fix is pending, publish advisories when others are affected (what, who is affected, how to fix), ship fixes via an automated trusted channel, update the PW.1.2 records.

### RV.3 Root causes
- [ ] **RV.3.1** Determine the root cause of each vulnerability.
- [ ] **RV.3.2** Look for patterns over time (a practice not followed consistently) and add toolchain/manual checks to catch recurrences.
- [ ] **RV.3.3** Search the code for the same class of flaw and fix it proactively.
- [ ] **RV.3.4** Update the SDLC process if needed so the root cause does not recur.

## Release checklist (note: our synthesis from the tasks above)
- [ ] All changes reached the default branch via reviewed PR (PS.1.1, PW.7.2); CI green.
- [ ] No secrets in repo or history; secret scan passed (PS.1.1).
- [ ] Dependency scan: no unresolved findings above your PO.4.1 threshold; exceptions recorded with owner/date (PW.4.4).
- [ ] SAST and security tests ran; every finding triaged in the tracker (PW.7.2, PW.8.2).
- [ ] Threat model/risk register still matches what is shipping; new features or data types were modeled (PW.1.1, PW.1.2).
- [ ] Secure defaults verified in the shipped config; debug/test accounts and endpoints off (PW.9.1, PW.9.2).
- [ ] Build is reproducible/controlled; artifact hashed or signed; version/digest pinned (PW.6, PS.2.1).
- [ ] SBOM generated and archived with the release (PS.3.2); release files archived read-only (PS.3.1).
- [ ] Staged or reversible rollout and a tested rollback path.
- [ ] Reporting channel and owner for vulnerabilities still valid (RV.1.3).

## Vulnerability handling basics (SSDF RV + OWASP Vulnerability Disclosure / Vulnerable Dependency cheat sheets)
- [ ] Publish how to report: security contact (`security@` mailbox, issue-tracker instruction, or a `security.txt` at `/.well-known/security.txt` per RFC 9116 with at least Contact and Expires). Reports go to a private channel.
- [ ] Acknowledge, confirm, give a timeline, tell the reporter when fixed; no legal threats against good-faith reporters.
- [ ] Triage: record, rate exploitability and impact, set a target date by severity (note: pick and write your own SLAs, e.g. Critical in days, Low next release).
- [ ] Fix at the root cause, add a regression test, check for the same flaw elsewhere (RV.3.3).
- [ ] Advisory when users are affected: summary and impact, vulnerable versions, fixed versions, caveats on when it applies, workarounds, CVE ID if assigned; credit the reporter if they agree.
- [ ] Dependencies: scan from day one (retrofitting is costly); use more than one advisory source; allow marking false positives; if no fixed version exists, mitigate or patch in-house or replace, and record the decision; do not silently ignore.
- [ ] Reference timing from the sheet: Project Zero gives vendors 90 days and publishes 30 days after a patch; use it only as a norm for disclosure deadlines.

**Common mistakes:** process docs nobody updates; security scan results that no one triages; "accept risk" without owner/date; release artifacts rebuilt per environment instead of promoted; CI with weaker access control than production.

Sources: NIST SP 800-218 SSDF v1.1, Feb 2022 (`ssdf.pdf`; US Government work, public domain, DOI 10.6028/NIST.SP.800-218); v1.2 draft status from csrc.nist.gov/pubs/sp/800/218/r1/ipd (checked 2026-11-02, no final found at /final). OWASP Cheat Sheet Series commit 1abd866 (Vulnerability_Disclosure, Vulnerable_Dependency_Management), CC BY-SA 4.0, https://cheatsheetseries.owasp.org. "(note)" = our additions.
