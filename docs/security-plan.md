# Security plan

Status: **validated by the user on 2026-11-02.** The `secure-development` skill (D1), the local secret-scan hook config (`.pre-commit-config.yaml`; install with `pre-commit install`), its templates and the `AGENTS.md` security rules (D8) are done and fact-checked. Still open, waiting for the stack decision: CI security pipeline, cloud hardening, threat model v1 and data inventory (written during planning).

Versions below were looked up on 2026-11-02; the skill's `SKILL.md` has the refresh procedure.

## 1. Goal

Build the app so that security is a property of the design, not a final check:

- follow a recognised secure-development standard (process), and verify the app against a recognised application standard (requirements);
- protect the data this app holds: health, money, personal notes, family-business data, other users' data;
- satisfy the course's graded security items (`docs/requirements.md`) and keep that posture in the phase 2 migration.

## 2. Standards baseline

| Standard | Role | Version (checked 2026-11-02) | Our target |
|---|---|---|---|
| OWASP ASVS | What the web app/API must do (requirements, verifiable) | 5.0.0, May 2025, ~350 requirements, 17 chapters, levels L1-L3 | **L2** for everything; L3 only for the auth and authorization chapters if cheap |
| OWASP Top 10 | Quick risk awareness, mapped into ASVS | current edition (verify when writing the skill) | Used as a checklist inside code review |
| OWASP MASVS | Mobile app requirements | 2.1.0 (Jan 2024); levels now live in MASTG | **Only if** a native iOS client is built |
| OWASP Top 10 for LLM applications | AI feature risks (prompt injection, data leakage) | verify when writing | Applies to the AI module |
| NIST SSDF, SP 800-218 | Secure development process | v1.1 final (Feb 2022); v1.2 is a draft (Dec 2025) | Follow v1.1 practice groups (PO, PS, PW, RV); note v1.2 changes |
| Microsoft cloud security benchmark (MCSB) | Azure resource hardening | v1 documented; v2 in preview since Nov 2025 | Use v1 controls; check v2 status |
| CIS Azure Foundations Benchmark | Second opinion for Azure settings | 6.0.0 listed (verify) | Reference only |
| GDPR (EU) | Legal baseline for personal data; health data is special category (Art. 9) | in force | Design rules in section 4.11; not legal advice |

Honest scope note: this is a solo, course-sized project. L2 here means "every L2 requirement is either implemented, or explicitly marked not applicable with a reason, or consciously deferred in a risk register". It does not mean an external audit or certification.

## 3. Deliverables

| # | Artefact | Where | When |
|---|---|---|---|
| D1 | `secure-development` skill: router `SKILL.md` + references distilled from the sources above + checklists + scripts | `.agents/skills/secure-development/` (symlink in `.claude/skills/`) | after plan validation, before any code |
| D2 | Threat model (assets, actors, data-flow diagram, trust boundaries, STRIDE table, abuse cases, risk register) | `docs/threat-model.md` | during planning, updated each iteration |
| D3 | ASVS L2 tracking matrix (requirement -> status, evidence, owner module) | `docs/security/asvs-matrix.md` | seeded after stack choice, updated per iteration |
| D4 | Data inventory and privacy design (what personal data, why, where stored, retention, export and delete) | `docs/security/data-inventory.md` | during planning |
| D5 | CI security pipeline (secret scan, dependency scan, SAST, IaC scan, container scan, authorization tests) | `.github/workflows/`, config files | first iteration (skeleton) |
| D6 | Azure hardening checklist mapped to MCSB, enforced in the IaC scripts | `docs/security/azure-hardening.md` + IaC | with the first deploy |
| D7 | `SECURITY.md` (how to report issues) and a short incident and key-rotation runbook | repo root and `docs/security/runbook.md` | before first deploy |
| D8 | Rules added to `AGENTS.md`: security is part of "done", never disable checks, never commit secrets, authorization tests per endpoint | `AGENTS.md` | with D1 |
| D9 | Pre-release security review using the `ponytail-review` pattern plus a security checklist | skill | each iteration end |

## 4. Security requirements by area (what the skill will cover)

**Reusability rule (user requirement):** every skill must be usable unchanged in any other project and with any agent. So the `secure-development` skill contains only generic, stack-neutral guidance (and clearly scoped optional files, such as Azure or iOS, that apply only when that target is used). Everything specific to Life Tracker lives in project files (`docs/threat-model.md`, `docs/security/*`, `AGENTS.md`), never in the skill. The templates inside the skill are blank.

Each area becomes one reference file, with the ASVS chapters it maps to, concrete rules, and a verification checklist. Items marked **(this app)** below are Life Tracker specifics: they go into the project threat model and data inventory, not into the skill; the skill carries the generic version of the same rule.

1. **Authentication.** Use a managed identity provider (Microsoft Entra External ID or equivalent, decision pending), never home-made password storage. MFA option. OIDC with PKCE. Account recovery without user enumeration. Rate limiting and lockout.
2. **Session and tokens.** Short-lived access tokens, refresh rotation, secure cookie flags if cookies are used, logout and revocation, token storage rules per client (web vs iOS Keychain).
3. **Authorization.** Deny by default. Every request is checked server-side against the authenticated user's ownership and role. **(this app)** multi-user means every row carries an owner or tenant id and every query filters on it; the family-business module needs shared access with roles (owner, member, read-only). Automated tests: user A cannot read, change or delete user B's data (IDOR tests per endpoint).
4. **Input and output.** Validate at every trust boundary, parameterised queries only, output encoding, safe file handling. **(this app)** Excel import (Wedding module) is untrusted input: size limit, no macros (`.xlsx` only), no formula evaluation, CSV/formula injection guarding on export, zip-bomb limits, parsing in a sandboxed worker.
5. **API security.** Schema validation, rate limits, pagination limits, no mass assignment, consistent error shape without internals, CORS allow-list, request size limits, idempotency for money entries.
6. **Data protection.** TLS everywhere, encryption at rest (platform-managed keys at minimum), field-level encryption decision for health and finance data (open question), no sensitive data in logs or URLs, backups encrypted, secure deletion on account removal.
7. **Secrets and keys.** Key Vault and managed identity, no secrets in repo or CI logs, rotation procedure, pre-commit and CI secret scanning. Never ask the user to paste secrets into chat (already in `AGENTS.md`).
8. **Logging, monitoring, alerting.** Security events logged (auth failures, authorization denials, imports, exports, admin actions) without sensitive payloads; log retention; alert on anomalies; audit trail for shared-business data.
9. **Dependencies and supply chain.** Lockfiles, pinned versions, Dependabot or Renovate, vulnerability audit in CI, SBOM generation, only reputable packages (ponytail already says no dependency for a few lines), pinned GitHub Actions versions, minimal workflow permissions.
10. **Infrastructure and Azure.** No public DB or storage (private endpoint, VNet or firewall), managed identity, least-privilege RBAC, HTTPS only and TLS minimum version, tags, Defender for Cloud recommendations reviewed, diagnostics on, IaC scanned (Checkov or equivalent), containers scanned and run as non-root, teardown scripts verified.
11. **Privacy and GDPR design.** Data minimisation (collect only what a module needs), purpose per data type, explicit consent for health data and for sending any data to an AI provider, export of the user's data, deletion of the account and all data, retention rules, no tracking or analytics by default, clear in-app privacy copy (follow `apple-design` writing and privacy references).
12. **Mobile / iOS (only if native client).** MASVS categories: storage (Keychain, Data Protection classes), network (ATS, optional pinning decision), platform interaction, code, resilience (kept proportionate), privacy. HealthKit data stays on device unless the user explicitly syncs; HealthKit permissions follow Apple's rules.
13. **AI module.** **(this app)** Treat model output as untrusted. Prompt-injection defences for any content the model reads (notes, imported text). Send the minimum data, never health or finance data without an explicit per-feature consent, no model-driven actions without user confirmation, per-user rate and cost limits, keys held server-side, log what category of data was sent. Check the provider's data-retention and training terms for the subscription the user wants to use before choosing it.
14. **Notifications.** No sensitive content on lock-screen text by default; push tokens stored per user and revoked on logout; a user can always turn each category off.
15. **Secure development process (SSDF).** Branch protection, PR review (self-review with a checklist counts for a solo project), signed commits optional, threat model updated when a module is added, vulnerability handling (triage SLA written in the runbook), release checklist.
16. **Testing and verification.** Unit tests for security-critical logic, authorization test matrix, DAST scan with OWASP ZAP against a deployed test environment (ephemeral Azure env fits), dependency and container scans, manual walkthrough of the ASVS L2 matrix before the course presentation.

## 5. Threat model approach (D2)

1. List **assets**: health records, body-weight and nutrition logs, transactions and subscriptions, notes and projects, wedding data, family-business financials, contacts and companies (work opportunities), credentials and tokens, AI conversation content.
2. List **actors**: the owner, other users, a family-business member with limited role, an anonymous internet attacker, a compromised dependency or CI action, a curious cloud operator, an AI provider.
3. Draw a **data-flow diagram** per tier (client -> API -> DB/storage/queue/AI) with trust boundaries.
4. Apply **STRIDE** per element and record threat, mitigation, ASVS reference, status.
5. Write **abuse cases** specific to the app (examples: user changes an id in a URL to read another user's weight; malicious Excel file in Wedding import; prompt-injection text inside a note that makes the AI exfiltrate data; business-dashboard member escalating to owner).
6. Keep a **risk register** with accepted risks and the reason. Review at the end of every iteration.

## 6. CI pipeline (D5), tool-neutral first

| Check | Purpose | Candidate tool (confirm when stack is known) |
|---|---|---|
| Secret scanning | stop leaked keys | GitHub secret scanning + push protection, gitleaks in pre-commit |
| Dependency vulnerabilities | known-vulnerable packages | Dependabot alerts + the language's audit command |
| SAST | code-level flaws | CodeQL (free for private repos on supported plans: verify) or Semgrep |
| IaC scan | insecure Azure config | Checkov or Trivy config |
| Container scan | vulnerable images | Trivy |
| License and SBOM | supply chain visibility | Syft/CycloneDX |
| Authorization tests | tenant isolation | project tests, required to pass |
| DAST | running-app flaws | OWASP ZAP baseline against the ephemeral test env |
| Workflow hardening | CI itself | pinned action versions, least `permissions:` |

Failing checks block merge to `main`. Agents may not weaken or skip a check; if a finding is a false positive it is suppressed with a written reason in the risk register.

## 7. Shape of the `secure-development` skill (D1)

```
.agents/skills/secure-development/
  SKILL.md                      router + non-negotiables + how to use
  references/
    process-ssdf.md             how we work: threat model first, review, release checklist
    asvs-l2-checklist.md        ASVS 5.0 chapters rewritten as checkable items, mapped to our areas
    authn-authz.md              areas 1-3, incl. generic multi-tenant isolation and role rules
    data-and-privacy.md         areas 6, 11 with the data classification
    api-and-input.md            areas 4, 5 incl. generic file upload/import handling
    cloud-azure.md              area 10 mapped to MCSB; optional, read only when the target is Azure
    supply-chain-and-ci.md      areas 9, 15, 16 and the pipeline
    ai-security.md              area 13; optional, only if the project uses LLMs
    mobile-ios.md               area 12; optional, only for native iOS clients
    threat-modeling.md          section 5 as a procedure with a template
  templates/
    threat-model.md  risk-register.md  asvs-matrix.md  data-inventory.md
  scripts/                      helper scripts only if they save real work
```

Method (same as `apple-design`): read the primary sources (OWASP repositories, NIST publications, Microsoft Learn), rewrite in our own words with exact identifiers (for example ASVS requirement numbers), mark our own additions with `(note)`, then run independent verification agents against the sources and fix errors in place. Add a `Sources` line per file and a refresh procedure.

## 8. Rules that go into `AGENTS.md` (D8)

- Read the `secure-development` skill before designing or changing authentication, authorization, data access, file handling, AI features, infrastructure or CI.
- Security checks are part of "done"; a change that fails them is not finished.
- Never disable, skip or weaken a security check or test to make a build pass.
- Every new endpoint ships with an authorization test (owner allowed, other user denied, anonymous denied).
- Never log, commit or paste secrets, tokens, or health/finance data.
- New dependency, new data type, new external service or new AI use: update `docs/threat-model.md` and `docs/security/data-inventory.md` in the same PR.

## 9. Work packages and order

| WP | What | Depends on | Output |
|---|---|---|---|
| S1 | Validate this plan with the user; resolve the open questions below | - | decisions in `docs/decisions.md` |
| S2 | Research sources and write the `secure-development` references (parallel agents, one area each) | S1 | draft skill |
| S3 | Independent fact-check of the references against the sources | S2 | verified skill |
| S4 | Add templates and the `AGENTS.md` rules; wire `.claude/skills` symlink | S3 | D1, D8 |
| S5 | Threat model v1 and data inventory, written together with the app planning round (modules, platform, AI, auth) | planning Q&A | D2, D4 |
| S6 | ASVS matrix seeded, CI pipeline and Azure hardening checklist | stack and IaC chosen | D3, D5, D6 |
| S7 | `SECURITY.md` and runbook | first deploy design | D7 |
| S8 | Per iteration: update threat model, run checks, review, ASVS matrix pass | each iteration | D9 |

S1-S4 can happen now. S5 is intertwined with the module-by-module planning (many security answers come from there). S6-S7 wait for the stack decision.

## 10. Decisions on the open questions (answered 2026-11-02)

1. **ASVS target: L2 overall, L3 only for authentication and authorization where cheap** (agent recommendation, accepted: the user delegated the choice).
2. **No health data ever goes to an AI provider** (user decision). Finance and other data: only with explicit per-feature consent, default off.
3. **Encryption:** platform-managed encryption at rest in the course phase; design the schema so sensitive columns can get field-level encryption later (agent recommendation; the user did not know). Revisit when the stack is chosen.
4. **Users:** only the owner for now. Public release or other users will need a major security revision and is not designed for now. Multi-user isolation and roles are still built in, because the course requires authorization and the family-business module needs it.
5. **No third-party penetration test.** Evidence is a self-run ZAP scan plus the ASVS walkthrough.
6. **Local checks too:** pre-commit hooks run the same secret scan and basic checks so agents on any machine get them (user: yes if needed; agent judges it needed).

## 11. What this plan does not cover

- Legal advice or formal GDPR compliance work (design rules only).
- Physical or organisational controls beyond a one-person project.
- Certification (SOC 2, ISO 27001). The ASVS matrix is self-assessment.
