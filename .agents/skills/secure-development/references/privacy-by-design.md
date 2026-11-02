# Privacy by design (apps that handle personal and sensitive data)

**When to read this:** you design or review any feature that collects, stores, shares, logs or deletes data about people (accounts, profiles, health, finance, location, messages, photos, device identifiers). Read it at design time, before the data model is fixed; retrofitting is costly.
**Disclaimer: this is design guidance, not legal advice.** Laws differ by country and user group; consult a qualified privacy specialist or lawyer for obligations. Lines marked `(note)` are not from the sources. GDPR points are marked `(note, GDPR)`.

Contents: Design rules, Special-category data, Logging without personal data, Data lifecycle, User rights features, Third parties, Cheat sheets to open, How to verify, Common mistakes, Sources.

## Design rules (checklist)
- [ ] Inventory data first: for every personal field, record what it is, why you need it (purpose), where it lives, who can read it, how long you keep it. Classify into protection levels, including data that is only encoded (Base64, JWT payload) (ASVS 14.1.1, L2).
- [ ] Per protection level, write the requirements: encryption, integrity, retention, logging, access to sensitive data in logs, database-level encryption, privacy-enhancing techniques (ASVS 14.1.2, L2), then implement them as written (14.2.4, L2).
- [ ] Data minimisation: do not collect, store or request a field or permission "just in case". The best protection is not holding the data (Cryptographic Storage cheat sheet; MASVS-PRIVACY-1). (note) Ask per field: what breaks if it is removed?
- [ ] (note) Purpose limitation: use data only for the purpose it was collected for; a new purpose needs a new decision (and consent if required). Isolate identifiers collected for one purpose (e.g. fraud signals) from other uses such as analytics (MASVS-PRIVACY-2).
- [ ] Return the minimum: APIs and screens expose only needed fields; mask by default, reveal on explicit user action (ASVS 14.2.6, L3; 15.3.1, L1).
- [ ] Prefer anonymised or pseudonymised data where identity is not needed (MASVS-PRIVACY-2; Logging cheat sheet de-identification).
- [ ] Privacy-protective defaults: sharing, telemetry and public visibility off until the user opts in. (note)
- [ ] Transparency: tell users clearly what is collected, stored and shared, including anything they would not reasonably expect (background collection); adhere to platform data-declaration rules (MASVS-PRIVACY-3). If you cannot protect data well enough (legally or technically), say so plainly (User Privacy Protection cheat sheet, honesty and transparency).
- [ ] Consent: ask informed consent before collecting optional or sensitive data and before any third-party SDK collects anything; SDKs must obey consent state, not run by default (MASVS-PRIVACY-1). Allow withdrawal (revoking consent: MASVS-PRIVACY-4; (note) as easily as granting); re-prompt and update disclosures when you need more data than first stated (MASVS-PRIVACY-4).
- [ ] Ask for device permissions (location, camera, contacts, health store...) only when the feature needs them, at the moment of use, with a clear reason; the app must still work if refused. (note)
- [ ] Threat-model the data: who do you protect it from (other users, insiders, thieves, partners, an abusive person with the user's device)? Choose the encryption layer from the answer (Cryptographic Storage cheat sheet).

## Special-category and high-sensitivity data
Health, biometrics, sexual life, religion, political opinions, ethnic origin, children's data, precise location, government IDs, financial account data, and anything whose disclosure could cause discrimination, harm or fraud.
- [ ] Treat as the highest protection level: encrypt at rest and in transit, strict least-privilege access, access audited, excluded from logs, analytics and crash reports (crash reports: note) (ASVS 14.1-14.2, 16.2.5; Logging cheat sheet "data to exclude" names health data and government identifiers).
- [ ] Collect only what the feature needs, at the coarsest useful granularity (e.g. a daily total instead of a raw sensor stream, a city instead of GPS). (note)
- [ ] Keep it out of URLs, push-notification text, lock-screen previews, shared screenshots, clipboard and app-switcher snapshots; no third-party trackers receive it (ASVS 14.2.1, 14.2.3, L1/L2). (note for notifications and snapshots)
- [ ] Short retention with automatic deletion unless the user chooses to keep it (ASVS 14.2.7, L3).
- [ ] Prefer on-device processing and storage where it meets the need; if synced, encrypt before upload where the threat model justifies it (key management: see `platform-data-ops.md`). (note)
- [ ] Plan for abuse by someone with physical or account access (partner, employer): session list and remote session invalidation, (note) optional app lock, no sensitive data in notifications (User Privacy Protection cheat sheet: remote session invalidation, panic mode).
- [ ] (note, GDPR) Health, biometric and similar categories are "special categories" (GDPR Art. 9) and need an Art. 9 condition (usually explicit consent); large-scale processing often needs a data-protection impact assessment (Art. 35). This is design guidance, not legal advice. Check with a specialist before launch.
- [ ] (note) A personal-use app that stores only its owner's data still follows these rules: the "user" is you in the future, and the data outlives the code.

## Logging without personal data
- [ ] Log security events and metadata (who as an opaque ID, what, when, outcome), not content. Never log passwords, tokens, session IDs (hash instead), keys, connection strings, payment data, or sensitive personal data such as health or government identifiers; mask, hash or drop them (ASVS 16.2.5, L2; Logging cheat sheet).
- [ ] Do not log data the user did not consent to or opted out of, nor data it is illegal to collect (Logging cheat sheet).
- [ ] Use opaque internal user IDs in logs, not email, name or phone; deletion of a user then does not require rewriting logs. (note)
- [ ] Treat logs as a sensitive asset: restricted access, tamper protection, separate system, documented retention, delete when retention ends (ASVS 16.1.1, 16.4.2, 16.4.3; Logging cheat sheet "disposal of logs").
- [ ] Error responses and crash/analytics reports carry no personal data or stack contents that embed it (ASVS 16.5.1, L2).
- [ ] Debug logging that may contain personal data is off in production and never left on after an incident. (note)

## Data lifecycle: storage, retention, deletion
- [ ] Define a retention period per data class and enforce it automatically (scheduled job, TTL), not by good intentions (ASVS 14.2.7, L3; Logging cheat sheet: do not keep logs, debug logs or backups beyond the retention period).
- [ ] Deletion reaches everything: primary store, search indexes, caches, derived data, object storage, analytics copies, logs where feasible, and backups on their normal expiry cycle (document the backup delay). (note)
- [ ] Do not cache sensitive data in shared server components, or purge it after use (ASVS 14.2.2, L2); send `Cache-Control: no-store` on sensitive responses (14.3.2, L2); keep sensitive data out of browser storage except session tokens (14.3.3, L2); clear client data at session end (14.3.1, L1).
- [ ] Strip sensitive metadata (EXIF, GPS, author fields) from uploaded files unless the user consents to keeping it (ASVS 14.2.8, L3).
- [ ] Encrypt at rest per the threat model (see `platform-data-ops.md`, V11 and the Cryptography choices table); keep keys apart from data; make data re-encryptable (ASVS 11.2.2).
- [ ] Do not copy production personal data into dev, test or demo environments; use synthetic or anonymised data. (note)
- [ ] Do not send personal data to external recipients, endpoints or tools that were not chosen by the owner of the data. (note)

## User rights features (design them in, not later)
Build these as real features with tests (MASVS-PRIVACY-4: users can manage, delete and modify their data and change privacy settings):
- [ ] **Access / export:** one action produces the user's data in a common machine-readable format (JSON/CSV) including data they entered and data derived about them; authenticated, rate-limited, delivered over a secure channel, with an audit log entry. (note, GDPR: access and portability.)
- [ ] **Correction:** the user can edit their data. (note, GDPR: rectification.)
- [ ] **Deletion:** account and data deletion is self-service, reaches all stores (see lifecycle), is confirmed, and is irreversible after a stated grace period; re-authenticate before executing. Define what is kept and why (e.g. legal or fraud-prevention records) and tell the user. (note, GDPR: erasure.)
- [ ] **Consent management:** a settings screen lists each optional processing purpose with its current state; changes take effect immediately and are logged. (MASVS-PRIVACY-4)
- [ ] **Sessions/devices:** user can see active sessions and revoke them (User Privacy Protection cheat sheet).
- [ ] Identify the requester before disclosing or deleting: access and deletion endpoints sit behind authentication and authorization like any other sensitive endpoint. (note)
- [ ] (note, GDPR) Statutory response times (commonly one month) apply to organisations; design so the action is instant and automated, so no manual process is needed.

## Third parties and sharing
- [ ] Share data with third parties only when necessary and with consent where required; know the SDK/dependency supply chain so data is not passed down it unintentionally (MASVS-PRIVACY-1).
- [ ] No sensitive data to user trackers or analytics services (ASVS 14.2.3, L2); prefer first-party, aggregate, cookieless analytics. (note)
- [ ] External content loaded in user pages (avatars, images, embeds) can leak the user's IP address; let users block it or proxy it (User Privacy Protection cheat sheet, prevent IP address leakage).
- [ ] Due diligence (regulatory and security) before sending log or event data to a third party (Logging cheat sheet). (note, GDPR) A processor/sub-processor agreement is usually required when a vendor handles personal data for you.
- [ ] Send HSTS, use TLS everywhere, and (note) consider certificate pinning only where the threat model needs it (User Privacy Protection cheat sheet; ASVS V12).
- [ ] Do not block anonymity networks without evaluating the impact; where feasible allow access through them (User Privacy Protection cheat sheet).

## Cheat sheets to open for detail
OWASP Cheat Sheet Series (https://cheatsheetseries.owasp.org): User Privacy Protection; Logging; Logging Vocabulary; Cryptographic Storage; Key Management; Secrets Management; Database Security; Mobile Application Security (device-side storage and privacy); Transport Layer Security; HTTP Strict Transport Security. Also ASVS V14 and MASVS-PRIVACY-1..4 and MASVS-STORAGE.

## How to verify
- Pick 5 personal fields at random and trace each: why collected, where stored, who reads it, when deleted. Any gap is a finding.
- Delete a test user, then search every store (DB, indexes, object storage, cache, logs) for their identifiers; only documented exceptions may remain.
- Export a test user's data; check completeness, format, and that another user cannot request it.
- Grep logs from a full test run for emails, names, tokens, IDs, health values; expect none.
- Run the app with a network proxy and check that no personal data reaches third-party hosts, and nothing is sent before consent.
- Check URLs, push payloads, crash reports and analytics events for personal data.
- Confirm retention jobs actually run and delete (check a record past its retention date).

## Common mistakes
- Collecting fields "for later"; keeping everything forever; no retention job.
- Soft-delete only ("deleted" flag): data stays in indexes, exports and backups.
- Personal or health data in logs, error messages, analytics events, push notifications or URLs.
- An analytics/crash SDK initialised before consent, or receiving sensitive values.
- Production data copied to test environments or shared with an AI/third-party tool.
- Treating encryption as the whole answer: access control, minimisation and retention still apply.
- Consent that is bundled, pre-ticked, or impossible to withdraw; deletion that needs an email to the developer.
- Building export and deletion last, after the schema makes them hard (data spread over many stores without a user key).

## Sources
- OWASP ASVS 5.0.0 chapters V14 (data protection), V16.2.5, V11.2.2, V15.3.1; git master `9ccce0e3cf47abd6a412fc8a8deadd7fd6da501f` (2026-10-26). CC BY-SA 4.0. https://github.com/OWASP/ASVS
- OWASP MASVS (MASVS-PRIVACY-1..4), git `bbe226f` (2026-09-21). CC BY-SA 4.0. https://github.com/OWASP/owasp-masvs
- OWASP Cheat Sheet Series, git `1abd8667e9311f7ae54eb9be8fc1e28cc6a15de9` (2026-11-01): User Privacy Protection, Logging, Cryptographic Storage, Secrets Management. CC BY-SA 4.0. https://cheatsheetseries.owasp.org
- No official OWASP privacy cheat sheet beyond these was found in the checkout; the User Privacy Protection sheet focuses on anonymity threats and is only partly general. Lifecycle, export, deletion and GDPR lines are marked `(note)`. Not legal advice.
- Condensed by an AI agent; not an official OWASP text.
