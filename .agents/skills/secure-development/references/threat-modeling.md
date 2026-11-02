# Threat modeling procedure

**When to read this:** before designing a feature or system, when a design change touches data, trust or external services, and when reviewing a design for security. It is the SSDF PW.1.1/PW.1.2 task in practice.
Output: a small `threat-model` document in the repo (DFD + threat table + risk register), kept current. Size it to the system: a one-page model beats none.

## The four questions (Threat Modeling Manifesto, via OWASP cheat sheet)
1. What are we working on? 2. What can go wrong? 3. What are we going to do about it? 4. Did we do a good enough job?
(note) Manifesto principles worth keeping: start early, iterate rather than do it once, model for the system you actually have, communicate with all stakeholders, use it to find and fix real problems.

## Procedure

### 1. Scope and assets (question 1)
(note) The cheat sheet only says "model the system"; this step's checklist is our synthesis.
- [ ] State what is in and out of scope (system, version, environments).
- [ ] List assets: data (classify each type: public / internal / personal / secret / regulated), credentials and keys, availability-critical functions, reputation/money-bearing business functions.
- [ ] List actors: legitimate roles (anonymous, user, admin, operator, service accounts) AND adversaries (curious user, malicious user, outsider, compromised dependency/vendor, insider, automated bots). Note goal and capability of each.
- [ ] Note security requirements per asset (confidentiality, integrity, availability, authenticity).

### 2. Data-flow diagram and trust boundaries
- [ ] Draw a DFD (whiteboard or text/diagram-as-code kept in the repo, so the team can update it): external entities, processes, data stores, data flows. Use a high-level diagram plus detail diagrams for complex parts.
- [ ] (note) Mark trust boundaries wherever data or control crosses to a different privilege level or owner: internet to app, client to server, app to datastore, app to third-party API, between services/tenants, CI to production, user-supplied content to interpreter.
- [ ] (note) Mark entry points (every input an outsider or lower-trust component can reach) and exits.
- [ ] Cloud or managed services: include IAM roles, networks, managed services, storage, and say who owns each control (shared responsibility); ephemeral infra (IaC, containers, serverless) is part of the model.
- Alternative for non-technical participants: brainstorm the domain's key processes first, then convert to a DFD.

### 3. Find threats with STRIDE per element (question 2)
Apply to each process, data store, data flow and external entity, especially across trust boundaries:

| Threat | Violates | Ask | Typical example |
|---|---|---|---|
| Spoofing | Authentication | Can someone pretend to be another user/service? | stolen token reused |
| Tampering | Integrity | Can data/code be altered in transit, at rest, or in the pipeline? | unintended DB update via a flawed endpoint |
| Repudiation | Accounting | Can an actor deny an action, or alter the logs? | log manipulation |
| Information disclosure | Confidentiality | Can data reach someone not entitled? | account data extracted from a store |
| Denial of service | Availability | Can the function be exhausted or locked? | lockout by repeated failed logins |
| Elevation of privilege | Authorization | Can an actor do more than their role? | JWT role claim tampering |

(note) Typical per-element focus: external entity = S, R; process = all six; data store = T, R, I, D; data flow = T, I, D.
- [ ] Record each threat with: ID, element/flow/boundary affected, STRIDE category, short scenario.
- [ ] Rank by likelihood x impact (and, if useful, cost to fix). (note) Use a simple High/Medium/Low scale; record CVSS only for specific vulnerabilities. Never bend a CVSS score to express business risk (Abuse Case sheet).
- [ ] Add other lenses only when scope needs them, and say why: attack trees for a high-value multi-step goal; LINDDUN for privacy harms; PASTA/OCTAVE/VAST for business- or org-level scopes.

### 4. Abuse cases (misuse of valid features)
STRIDE finds technical threats; abuse cases find misuse of correct behavior. For each feature/user story:
- [ ] Define an abuse case: a way to use the feature that the implementer did not expect and that lets an attacker influence its outcome. Give each a unique ID (e.g. `ABUSE_CASE_001`).
- [ ] Flag it Technical or Business. Probe: out of order, repeated, concurrent, for an unintended outcome; (note) also with other users' identifiers, extreme values, skipped steps, replay.
- [ ] Record: ID, feature, attack, risk rating, countermeasure ID, decision (To Address / Risk Accepted + reason).
- [ ] Turn each "To Address" case into a security requirement or acceptance criterion of the story, and into a test (negative test or CI check). Mark where it is handled (design note or code comment citing the ID).
(note) The OWASP Abuse Case Cheat Sheet is archived/"historical" and says the full workshop framework is heavyweight; keep the lightweight list-and-link-to-tests idea only.

### 5. Mitigations (question 3)
Per threat choose and record one response (Shostack):
- **Mitigate** (reduce likelihood/impact), **Eliminate** (remove the feature/component), **Transfer** (contract/insurance/third party: does not reduce likelihood or impact; name who owns the remaining controls and residual risk), **Accept** (record owner, reason, date to revisit).
- [ ] Turn every mitigation into a testable security requirement with an owner and an implementation location (network, infra, code, design).
- [ ] (note) Prefer controls that remove a whole class (deny by default, parameterized queries, managed identity) over per-case patches.

### 6. Risk register (with accepted risks)
(note) Table and rules below are our synthesis; the sources only require recording each response, rationale and accepted residual risk (PW.1.2).
Keep in the repo. One row per threat/abuse case:

| ID | Threat / abuse case | Asset | Likelihood | Impact | Response | Control / requirement | Status | Owner | Review by |
|---|---|---|---|---|---|---|---|---|---|

- [ ] Accepted risks: reason, owner, expiry/review date. An acceptance without a date is a defect.
- [ ] Residual risk after mitigation is stated, not assumed zero.

### 7. Validate (question 4)
- [ ] DFD matches the real system? All entry points and boundaries covered? Every threat has a response? Do mitigations bring risk to an acceptable level? Are they testable and tested?
- [ ] Review by someone not involved in the design (SSDF PW.2.1), or an automated check.
- [ ] Store artifacts so those with need-to-know can read them; link from design docs and the security requirements.

## When to update the model
(note) The sources say only "maintain and update alongside the system"; the triggers below are our list.
Update (and re-review) when any of these happens:
- [ ] A new module/service/endpoint, or a change of a trust boundary or data flow.
- [ ] A new data type or a change of classification (e.g. the first personal, financial or health data).
- [ ] A new external service, SDK, plugin, or third-party integration; a change of identity provider.
- [ ] A new actor/role, a new exposure (internal to internet), a new environment or hosting model.
- [ ] A change to authentication, authorization, crypto or secret handling.
- [ ] After a security incident, a vulnerability report, or a failed assumption (feed root cause RV.3 back in).
- [ ] An accepted risk reaches its review date.
(note) Cheap trigger: add "does this change the threat model?" to the PR template.

## Worked example: "notes app" with sharing and attachments (generic)
(note) Illustrative, written by us; only the ABUSE_CASE_nnn ID format and ASVS 11.5.1 come from sources.
DFD: Browser (external) -> API (process) -> Database (store); API -> Object storage (attachments); API -> Email provider (external). Trust boundaries: internet|API, API|datastores, API|email provider. Assets: note text (personal), attachments, session tokens, share links.

| ID | Abuse case | Why it works | Mitigation | Test |
|---|---|---|---|---|
| ABUSE_CASE_001 | Attacker changes the note ID in `GET /notes/{id}` to read another user's note | object lookup by ID only (IDOR / Broken Access Control) | server-side ownership check on every read/write, deny by default | user A requests user B's note -> 403/404 |
| ABUSE_CASE_002 | Attacker uploads an HTML/script file as an attachment, then lures a victim to open it | file served inline from the app's origin | allow-list types, store outside web root under random names, serve with `Content-Disposition: attachment` and a safe content type, separate origin | upload `.html`, assert it downloads, never renders |
| ABUSE_CASE_003 | Bot guesses short share-link tokens | low-entropy, non-expiring tokens | CSPRNG tokens with at least 128 bits of entropy (ASVS 11.5.1), expiry, revocation, rate limiting | token entropy and expiry tests |
| ABUSE_CASE_004 | Attacker triggers password-reset for many accounts to flood a victim or enumerate who has an account | different responses/unbounded sends | identical response for all outcomes, per-account and per-IP limits, reset tokens single-use and short-lived | response equality test, limit test |
| ABUSE_CASE_005 | Attacker replays an old request / double-submits "delete account" or "export" concurrently to cause inconsistent state or heavy load | no idempotency, no limits, no re-auth for critical actions | idempotency keys or state checks, transactions that roll back on error (fail closed), quotas, re-authentication for destructive actions | concurrent-request test |

Residual-risk row example: "DoS by volumetric traffic: Accepted, owner = platform lead, mitigated only by provider defaults, review 6 months."

**Common mistakes:** model made once and never updated; only listing technical threats; no owner/date on accepted risks; threats without a mitigation or test; DFD without trust boundaries; treating CVSS as business risk.

Sources: OWASP Cheat Sheet Series commit 1abd866 (2026-11-01): Threat_Modeling_Cheat_Sheet, Abuse_Case_Cheat_Sheet (archived "historical"), CC BY-SA 4.0, https://cheatsheetseries.owasp.org; OWASP Top 10:2025 A06 Insecure Design (CC BY-SA 4.0); NIST SP 800-218 v1.1 (Feb 2022, US Government work, public domain) PW.1.1/PW.1.2/PW.2.1; SSDF v1.2 is an Initial Public Draft (Dec 2025), see `process-ssdf.md`; OWASP ASVS 5.0 11.5.1. Threat Modeling Manifesto (threatmodelingmanifesto.org) cited only via the cheat sheet; (note) items are our additions.
