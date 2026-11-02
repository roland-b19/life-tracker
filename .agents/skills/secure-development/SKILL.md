---
name: secure-development
description: Secure software development guidance distilled from OWASP ASVS 5.0, OWASP Top 10:2025, NIST SSDF (SP 800-218), OWASP Cheat Sheets, MASVS and the OWASP LLM Top 10, plus threat-model, risk-register, ASVS-matrix and data-inventory templates. Use whenever you design, write, review or verify anything security-relevant - authentication, sessions, authorization, multi-user data isolation, input handling, APIs, file upload/import, cryptography, secrets, configuration, logging, personal or health/finance data, privacy, dependencies, CI/CD, containers, infrastructure-as-code, cloud hosting, AI/LLM features, mobile clients - or when the user says "security", "threat model", "ASVS", "OWASP", "pentest", "harden", "is this secure", "vulnerability", "secure SDLC". Stack-neutral; works for any language, framework and agent.
---

# Secure development skill

Agent-neutral and project-neutral. Lives in `.agents/skills/secure-development/`. Rewritten (not copied) from public standards into compact, checkable rules that keep the exact IDs, levels and numbers. Every reference ends with a `Sources` line (version/commit, licence). Most OWASP sources are CC BY-SA 4.0, so reuse of these files keeps that attribution. Project-specific decisions (target level, data types, hosting) belong in the project's own docs, never in this skill.

## How to use

1. **Before designing or changing** anything in the table below, read the matching reference(s) in full for the section you need. Do not rely on memory: standards change (ASVS 5.0 renumbered ASVS 4.x).
2. **Target level.** Unless the project says otherwise: ASVS **L2** for everything, **L3** for authentication and authorization where it is cheap. Tick every `(L1)` and `(L2)` line; items that do not apply are marked N/A with a reason, never skipped silently. Lines marked `(note)` are not from the sources: verify before relying on them.
3. **Design first, then code.** For a new system or a design change that touches data, trust boundaries or external services: threat-model it (`references/threat-modeling.md`, templates in `templates/`) before building, and update the model in the same change.
4. **Security checks are part of "done".** Before finishing: run the relevant checklist, add the tests it asks for (at minimum an authorization test per endpoint: owner allowed, other user denied, anonymous denied), and say in the final message what you could not verify.
5. **If a rule here conflicts with the primary source, the source wins.** Open it, fix the reference, update `Sources`.

## Which reference to read

| Task | Read |
|---|---|
| New system or feature, design review, "what can go wrong" | `threat-modeling.md`, then fill `templates/threat-model.md` |
| Parsing input, database queries, HTML/JS output, redirects, outbound requests, HTTP/REST/GraphQL APIs, CORS, cookies and browser headers, uploads, downloads, spreadsheet/document import | `input-api-files.md` (ASVS V1-V5) |
| Login, registration, password reset, MFA, sessions, API keys, JWT, OAuth/OIDC, roles, ownership, multi-user or tenant isolation, admin features | `identity-access.md` (ASVS V6-V10) |
| Cryptography, TLS, configuration, secrets, sensitive-data protection, secure coding/architecture, logging, error handling | `platform-data-ops.md` (ASVS V11-V16) |
| Personal, health, financial or location data; consent, retention, deletion, export, logs, third parties | `privacy-by-design.md`, then fill `templates/data-inventory.md` |
| Repo, branches, reviews, CI/CD, dependencies, SBOM, secrets in repos, Docker, IaC, which automated checks to run | `supply-chain-and-ci.md`, `process-ssdf.md` |
| Release readiness, secure-development process, vulnerability handling | `process-ssdf.md`, `templates/asvs-matrix.md`, `templates/risk-register.md` |
| Risk-class overview, "did we cover the common failures?" | `owasp-top10-2025.md` (maps each entry to ASVS chapters) |
| **Optional:** hosting on Microsoft Azure | `cloud-azure.md` (read only if the target is Azure) |
| **Optional:** features that send data to an LLM, show model output, let a model call tools or retrieve documents | `ai-security.md` (read only if the project uses AI) |
| **Optional:** native mobile client (iOS focus) | `mobile-ios.md` (read only if a native client ships) |

When unsure which row applies, read `owasp-top10-2025.md` first (short) and follow its ASVS pointers.

## Non-negotiables (apply to every project)

- Authentication **and** authorization on every endpoint; authorization is enforced server-side on every request, by object (ownership/tenant), not only by route or UI.
- Deny by default. Never trust client input, headers, tokens, file names, file contents or model output; validate at the trust boundary, encode on output, parameterise every query.
- No secrets, tokens, keys, personal, health or financial data in source control, logs, error messages, URLs, prompts or chat. Secrets live in a secret store or the runtime environment; prefer short-lived identity (managed/workload identity) over static keys.
- Use vetted libraries and managed services for authentication, cryptography and sessions. Never invent crypto, password hashing or token formats.
- Data stores and internal services are not reachable from the public internet. TLS everywhere in transit; encryption at rest.
- Never disable, skip, weaken or "temporarily" bypass a security check, test, scanner, hook or branch protection to make something pass. Fix the cause or escalate to the user.
- Every new dependency, data type, external service or AI use is a change to the threat model and the data inventory: update both in the same change.
- Log security-relevant events (auth, access denied, admin actions) without logging sensitive values.
- Fail closed and without leaking internals: generic error to the user, detail in the log.
- Sensitive categories (health, finance, children's data, credentials) get the strictest option by default: minimise collection, short retention, owner-only access, no third-party or AI-provider sharing unless the project explicitly decides so.

## Templates (`templates/`)

Blank, generic starting points to copy into the project (usually under `docs/`):
- `threat-model.md`: scope, data-flow diagram, assets, trust boundaries, threats, mitigations.
- `risk-register.md`: risks with likelihood, impact, owner, decision, status.
- `asvs-matrix.md`: ASVS chapter/requirement status per target level, with evidence and N/A reasons.
- `data-inventory.md`: every data type, where it lives, who can access it, retention, third parties.

## Limits

This skill is guidance for building and reviewing software; it is not a certification, an audit, a penetration test or legal advice (privacy/GDPR notes are design guidance). Self-run scanners and checklists reduce risk; they do not prove absence of vulnerabilities.

## Refreshing the references

Standards move. Re-check at least once a year or when a source publishes a new version:

| Source | Where | Note |
|---|---|---|
| OWASP ASVS | https://github.com/OWASP/ASVS (`5.0/en/`) | Requirement tables `V<chapter>.<section>.<req>` with level; check the released tag, not only `master` |
| OWASP Top 10 | https://owasp.org/Top10/ | Current edition 2025 |
| OWASP Cheat Sheet Series | https://github.com/OWASP/CheatSheetSeries | Updated continuously |
| NIST SSDF | SP 800-218 v1.1 (final); v1.2 was a draft in Dec 2025 | Check nist.gov for the final |
| OWASP MASVS | https://github.com/OWASP/owasp-masvs | Test profiles live in MASTG |
| OWASP Top 10 for LLM Applications | https://genai.owasp.org/ | 2025 edition |
| Microsoft cloud security benchmark | https://learn.microsoft.com/security/benchmark/azure/ | v2 was in preview when the reference was written |

Procedure: clone/fetch the source, diff the requirement IDs and levels against the matching reference, rewrite changed items in your own words, keep exact IDs/levels/numbers, mark non-source statements `(note)`, update the `Sources` line (version/commit, date). Never paste source text wholesale.
