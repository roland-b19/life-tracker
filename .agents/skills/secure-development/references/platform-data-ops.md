# Platform, data and operations security (ASVS 5.0 V11-V16)

**When to read this:** you design or review cryptography, TLS/transport, configuration and secrets handling, sensitive-data protection, dependency and architecture hygiene, logging, or error handling. Applies to any stack. Target level: pick L1 (baseline), L2 (default for apps holding user data), L3 (high assurance); L2 includes all L1 lines, L3 includes L1+L2.
Line format: `- [ ] <ASVS id> (L<n>) rule`. `(note)` = not from the sources.

Contents: V11 Cryptography, Cryptography choices (table), V12 Secure communication, V13 Configuration and secrets, V14 Data protection, V15 Secure coding and architecture, V16 Logging and error handling, V17 pointer, How to verify, Common mistakes, Sources.

## V11 Cryptography

### Inventory and documentation
- [ ] 11.1.1 (L2) Document a key-management policy and key lifecycle following a standard such as NIST SP 800-57. Do not overshare keys: a shared secret goes to at most 2 entities, a private key to at most 1.
- [ ] 11.1.2 (L2) Keep an up-to-date cryptographic inventory of all keys, algorithms and certificates; record where each key may and may not be used and which data types it may protect.

### Implementation
- [ ] 11.2.1 (L2) Use industry-validated crypto libraries or hardware implementations. Never write your own algorithms.
- [ ] 11.2.2 (L2) Crypto agility: RNG, authenticated encryption, MAC, hash algorithms, key lengths, rounds, ciphers and modes must be reconfigurable/swappable; keys and passwords must be replaceable and data re-encryptable (prepares for post-quantum migration).
- [ ] 11.2.3 (L2) Every primitive gives at least 128 bits of security (256-bit ECC ~ 128 bits; RSA needs 3072 bits for 128 bits).

### Encryption
- [ ] 11.3.1 (L1) No insecure block modes (ECB) or weak padding (PKCS#1 v1.5).
- [ ] 11.3.2 (L1) Only approved ciphers and modes, such as AES-GCM.
- [ ] 11.3.3 (L2) Protect encrypted data against modification: prefer authenticated encryption (AEAD), or an approved cipher plus an approved MAC.

### Hashing
- [ ] 11.4.1 (L1) Only approved hash functions for signatures, HMAC, KDF, random bit generation. MD5 never, for any cryptographic purpose.
- [ ] 11.4.2 (L2) Store passwords with an approved, computationally intensive password-hashing function, parameters set per current guidance (see table).
- [ ] 11.4.3 (L2) Hashes used for signatures, data authentication or integrity are collision resistant: output at least 256 bits where collision resistance is needed, at least 128 bits where only second-preimage resistance is needed.
- [ ] 11.4.4 (L2) Deriving a secret key from a password uses an approved KDF with key-stretching parameters balancing security and performance.

### Random values
- [ ] 11.5.1 (L2) Every non-guessable random value (tokens, keys, IDs, nonces) comes from a CSPRNG with at least 128 bits of entropy. UUIDs do NOT qualify.

### Public-key
- [ ] 11.6.1 (L2) Only approved algorithms and modes for key generation, seeding, signature generation/verification; do not generate keys vulnerable to known attacks (e.g. RSA keys weak to Fermat factorization).

### L3 (grouped)
- [ ] 11.1.3, 11.1.4 (L3) Use cryptographic discovery (SAST/DAST/CBOM tools) to find all crypto use; the inventory includes a migration plan to new standards such as post-quantum.
- [ ] 11.2.4, 11.2.5 (L3) All crypto operations constant-time (no short-circuit comparisons); crypto modules fail securely (no padding-oracle style errors).
- [ ] 11.3.4, 11.3.5 (L3) A nonce/IV is never reused with the same key and data element, and is generated appropriately for the algorithm; encrypt-then-MAC when combining cipher and MAC.
- [ ] 11.5.2 (L3) RNG stays secure under heavy demand.
- [ ] 11.6.2 (L3) Key exchange (e.g. Diffie-Hellman) uses approved, secure parameters.
- [ ] 11.7.1, 11.7.2 (L3) Full memory encryption for data in use; minimise data exposed during processing and encrypt it as soon as feasible after use.

### Key management practices (Cryptographic Storage and Secrets cheat sheets)
- [ ] Generate keys with a CSPRNG, never from words or keyboard-mashing; keep independent keys independent (data-encrypting vs key-encrypting).
- [ ] Rotate keys on: suspected compromise, end of the cryptoperiod (NIST SP 800-57 Part 1 5.3), approaching the mode's usage limits (e.g. AES-GCM IV/length limits in SP 800-38D), or a new attack on the algorithm. Have the rotation code and process ready before it is needed.
- [ ] Prefer re-encrypting data under the new key; alternatively tag each item with a key ID and keep old keys for decrypt. Keep retired keys only as long as backups need them.
- [ ] Envelope encryption: a data-encrypting key (DEK) wrapped by a key-encrypting key (KEK) stored on a separate system, KEK at least as strong as DEK. A KDF over a user passphrase can produce a KEK, so a passphrase change does not re-encrypt data.
- [ ] Store keys in a vault/KMS/HSM where available; keep keys apart from the data they protect. Never hard-code keys or commit them to version control.
- [ ] Do not rely on encryption alone: still enforce access control on encrypted data and do not trust "encrypted" URL parameters.
- [ ] Minimise: not storing sensitive data is the best protection. Choose the encryption layer (application, database, filesystem, hardware) from the threat model; disk/hardware encryption does not stop a remote attacker.
- [ ] Public-key encryption of data: use a maintained library with an established hybrid scheme such as HPKE, RSA only with OAEP; RSA at least 2048 bits by the cheat sheet, but ASVS 11.2.3 needs 3072 for 128-bit strength (follow ASVS at L2+).
- [ ] (note) Post-quantum: RSA/ECC are not PQ-secure; for long-lived confidential data plan hybrid key establishment with ML-KEM (NIST FIPS 203). AES for stored data stays.

## Cryptography choices (ASVS Appendix C, Cryptographic Storage cheat sheet)
Status: A = approved, L = legacy (compat only), D = disallowed. When unsure use the first row of each group.

| Need | Use (A) | Legacy (L) | Never (D) |
|---|---|---|---|
| Symmetric cipher | AES-256, ChaCha20, XChaCha20, AES-192 | AES-128 (document the reason) | 3DES/TDEA, DES, RC4, IDEA, Blowfish |
| AES mode | GCM, then CCM (both authenticated) | CBC only with encrypt-then-MAC and constant-time padding check | ECB, CFB, OFB, CTR (unauthenticated), CCM-8 |
| Authenticated encryption | AES-GCM, AES-CCM, ChaCha20-Poly1305, AEGIS, encrypt-then-MAC | MAC-then-encrypt | unauthenticated encryption (except disk encryption) |
| General hash | SHA-256/384/512, SHA-512/256, SHA3, BLAKE2/3 | SHA-224, SHA-1 (not for HMAC/KDF/signatures) | MD5, MD4, CRC for security |
| Password hash | argon2id (t=1: m>=47104 KiB; t=2: m>=19456 KiB; t>=3: m>=12288 KiB; p=1); scrypt (p=1: N>=2^17, r=8; p=2: N>=2^16; p>=3: N>=2^15); bcrypt cost>=10; PBKDF2-HMAC-SHA-512 >=210,000 iterations; PBKDF2-HMAC-SHA-256 >=600,000 | PBKDF2-HMAC-SHA-1 >=1,300,000 | plain or salted fast hashes |
| General KDF | HKDF | TLS 1.2 PRF | MD5/SHA-1-based KDFs |
| MAC | HMAC-SHA-256/384/512, KMAC, BLAKE3 keyed, AES-CMAC, AES-GMAC, Poly1305 | HMAC-SHA-1 | HMAC-MD5 |
| Signature | EdDSA (Ed25519/Ed448), ECDSA (P-256/384/521), RSA-PSS | | RSA PKCS#1 v1.5 signatures, DSA |
| Key exchange | ECDH (>=256-bit curves, Curve25519/448), FFDH (L>=3072) | | RSA key transport with PKCS#1 v1.5, IKEv1 |
| Key wrapping | AES-256 KW / KWP (SP 800-38F) | AES-192/128 only with documented reason | |
| Random | OS CSPRNG (/dev/urandom, getrandom, getentropy, SecRandomCopyBytes, BCryptGenRandom), AES-CTR/HMAC/Hash-DRBG | | language PRNGs (`rand`, `Math.random`, `random`, `mt_rand`), UUID v1/v4 as secrets |

Equivalent strength: 128 bits = AES-128 = RSA/FFDH 3072 = ECC 256-383; 192 = RSA 7680 = ECC 384-511; 256 = AES-256 = RSA 15360 = ECC 512+. Minimum for new designs: 128 bits (11.2.3); key exchange never below 112.
PQC (L3 planning): NIST FIPS 203, 204, 205 (Appendix C names only the numbers); (note) they specify ML-KEM, ML-DSA and SLH-DSA respectively. Hybrid (classical + PQ) key agreement while migrating (Appendix C mentions mlkem768x25519 for TLS).
(note) In the Random row, `getrandom` and the UUID v1/v4 ban are not in Appendix C; UUIDs fail 11.5.1 and language PRNGs are not CSPRNGs.

## V12 Secure communication

- [ ] 12.1.1 (L1) Enable only current TLS versions (1.2 and 1.3); the newest is preferred.
- [ ] 12.1.2 (L2) Enable only recommended cipher suites, strongest preferred. (L3: only suites with forward secrecy.)
- [ ] 12.1.3 (L2) When mTLS is used for identity, validate that the client certificate is trusted before using its identity for authentication or authorization.
- [ ] 12.2.1 (L1) TLS for all client connections to external-facing HTTP services; no fallback to plaintext.
- [ ] 12.2.2 (L1) External-facing services use publicly trusted TLS certificates.
- [ ] 12.3.1 (L2) Encrypted protocol (TLS) for ALL inbound and outbound connections: monitoring, management tools, SSH/remote access, middleware, databases, partner systems, external APIs. No fallback to plaintext.
- [ ] 12.3.2 (L2) TLS clients validate the server certificate before communicating.
- [ ] 12.3.3 (L2) TLS (or equivalent) also between internal HTTP-based services; no fallback.
- [ ] 12.3.4 (L2) Internal TLS uses trusted certificates; with internal or self-signed certs, consumers trust only the specific internal CAs/certs.
- L3: 12.1.4 revocation checking (e.g. OCSP stapling); 12.1.5 Encrypted Client Hello; 12.3.5 strong, replay-resistant mutual authentication between internal services (TLS client auth/PKI; consider a service mesh).
- [ ] (note) Send HSTS on HTTPS sites; never disable certificate validation "for testing" in shipped code.

## V13 Configuration and secrets

### Documentation (what must be written down)
- [ ] 13.1.1 (L2) Document all communication needs: external services relied upon, and every case where an end user can supply an external location the app then connects to.
- L3: 13.1.2 max concurrent connections per service and behaviour at the limit; 13.1.3 resource-management strategy per external system (release, timeouts, failure handling, retry limits/delays/back-off; short timeouts and no or strictly limited retries for synchronous HTTP); 13.1.4 list of security-critical secrets with a rotation schedule.

### Service-to-service
- [ ] 13.2.1 (L2) Backend components that do not use the user-session mechanism (APIs, middleware, data layers) authenticate with individual service accounts, short-term tokens or certificates, not static passwords, API keys or shared privileged accounts.
- [ ] 13.2.2 (L2) Backend-to-backend access uses least-privilege accounts.
- [ ] 13.2.3 (L2) No default credentials (root/root, admin/admin).
- [ ] 13.2.4 (L2) Allowlist the external resources/systems the app may talk to (outbound requests, data loads, file access); app layer, web server, firewall, or a mix.
- [ ] 13.2.5 (L2) The web/application server itself has an allowlist of destinations it may send requests to or load from.
- L3: 13.2.6 follow the documented per-connection settings (pool max, behaviour at max, timeouts, retries).

### Secrets
- [ ] 13.3.1 (L2) Use a secrets-management solution (key vault) to create, store, control access to and destroy backend secrets (passwords, keys, DB and third-party credentials, TOTP seeds, API keys). Secrets never in source code or build artifacts. L3 apps: hardware-backed (HSM).
- [ ] 13.3.2 (L2) Least-privilege access to secrets.
- L3: 13.3.3 perform crypto operations inside an isolated security module (vault/HSM) so key material never leaves it; 13.3.4 secrets expire and are rotated per the documented schedule.
- [ ] Secrets lifecycle (cheat sheet): create strong, minimally privileged; rotate (minutes to years by function; user passwords only on suspicion of compromise); revoke when unneeded or compromised and log attempts to use a revoked secret; set expiry; the consumer verifies the secret is still active.
- [ ] Prefer dynamic short-lease credentials and automated rotation over static secrets; keep human access to secrets minimal.
- [ ] Containers: never hard-code secrets in image ENV/ARG or build layers; the orchestrator mounts files or injects at runtime, or the app fetches from the secret store.
- [ ] Never log secrets; mask or encrypt if unavoidable. Run secrets detection (pre-commit hook, IDE, CI) and re-scan history; treat a leaked secret as compromised and rotate it.
- [ ] CI/CD: harden the pipeline; use designated service accounts scoped to the secrets they need; make every run attributable; log every action in the CI/CD tool (keep queryable at least 90 days).
- [ ] (note) Prefer short-lived federated/OIDC tokens in CI over stored long-lived credentials.

### Information leakage and hardening
- [ ] 13.4.1 (L1) Deploy without source-control metadata (.git, .svn) or make it unreachable externally and by the app.
- [ ] 13.4.2 (L2) Debug modes off in production in all components.
- [ ] 13.4.3 (L2) No directory listings unless intended.
- [ ] 13.4.4 (L2) HTTP TRACE not supported in production.
- [ ] 13.4.5 (L2) Internal API docs and monitoring endpoints are not exposed unless intended.
- L3: 13.4.6 no detailed backend version info; 13.4.7 web tier serves only files with allowed extensions.

## V14 Data protection

- [ ] 14.1.1 (L2) Identify and classify all sensitive data into protection levels, including data that is merely encoded (Base64, JWT payload). Account for applicable privacy rules.
- [ ] 14.1.2 (L2) Each protection level has documented requirements: encryption, integrity, retention, logging rules, access to sensitive data in logs, database-level encryption, privacy-enhancing technologies, confidentiality.
- [ ] 14.2.1 (L1) Sensitive data goes to the server only in the HTTP body or headers, never in the URL or query string (API keys, session tokens, personal data).
- [ ] 14.2.2 (L2) Sensitive data is not cached in server components (load balancers, app caches) or is purged after use.
- [ ] 14.2.3 (L2) Sensitive data is not sent to untrusted parties (user trackers, analytics SDKs).
- [ ] 14.2.4 (L2) Implement every control defined for each protection level (encryption, integrity, retention, logging, privacy techniques).
- [ ] 14.3.1 (L1) Authenticated data is cleared from client storage (DOM etc.) when the session ends; `Clear-Site-Data` can help, but the client must also clean up when the server is unreachable.
- [ ] 14.3.2 (L2) Anti-caching headers (`Cache-Control: no-store`) on sensitive responses.
- [ ] 14.3.3 (L2) Browser storage (localStorage, sessionStorage, IndexedDB, cookies) holds no sensitive data except session tokens.
- L3: 14.2.5 cache only expected content types, never sensitive dynamic content, return 404/302 for missing files (web cache deception); 14.2.6 return the minimum sensitive data, mask by default (e.g. last digits only); 14.2.7 retention classification with automatic or scheduled deletion; 14.2.8 strip sensitive metadata (e.g. EXIF/GPS) from user-submitted files unless the user consents to storing it.
- See also `privacy-by-design.md` for minimisation, consent, retention, export and deletion.

## V15 Secure coding and architecture

### Documentation and components
- [ ] 15.1.1 (L1) Document risk-based remediation time frames for vulnerable third-party components and for updating libraries in general.
- [ ] 15.1.2 (L2) Maintain an inventory (SBOM) of all third-party libraries; verify they come from predefined, trusted, maintained repositories.
- [ ] 15.1.3 (L2) Document resource-heavy or slow functionality and how you prevent availability loss (async processing, queues, per-user and global parallelism limits) and responses outliving the consumer's timeout.
- [ ] 15.2.1 (L1) Ship no component that has breached the documented update/remediation time frames.
- [ ] 15.2.2 (L2) Implement the defences against resource-exhausting functionality decided in 15.1.3.
- [ ] 15.2.3 (L2) Production contains only needed functionality: no test code, sample snippets, dev endpoints.
- L3: 15.1.4 document "risky components" (poorly maintained, EOL, vulnerability history); 15.1.5 document "dangerous functionality" (deserialisation of untrusted data, raw binary parsing, dynamic code execution, direct memory manipulation); 15.2.4 all transitive dependencies come from the expected repository, no dependency-confusion risk; 15.2.5 isolate dangerous functionality/risky components (sandbox, container, network isolation).

### Defensive coding
- [ ] 15.3.1 (L1) Return only the required subset of fields of a data object (no whole-entity serialisation).
- [ ] 15.3.2 (L2) Backend calls to external URLs do not follow redirects unless intended.
- [ ] 15.3.3 (L2) Prevent mass assignment: allowed fields are limited per controller/action; a field not meant for an action cannot be inserted or updated by it.
- [ ] 15.3.4 (L2) Proxies and middleware pass the original client IP in trusted fields users cannot forge; the app and web server use it for logging and rate limiting (it may still be unreliable behind VPNs/NAT).
- [ ] 15.3.5 (L2) Check variable types explicitly and use strict equality/comparison (no type juggling or confusion).
- [ ] 15.3.6 (L2) JavaScript: prevent prototype pollution (e.g. `Map`/`Set` instead of object literals for keyed data).
- [ ] 15.3.7 (L2) Defend against HTTP parameter pollution, especially when the framework does not distinguish query, body, cookie and header sources.

### Concurrency (all L3)
- [ ] 15.4.1 (L3) Thread-safe types and locking for shared objects (caches, files, in-memory state).
- [ ] 15.4.2 (L3) Check-and-act on a resource (existence, permission) as one atomic operation (no TOCTOU).
- [ ] 15.4.3 (L3) Consistent locking, no deadlock or endless retry; lock logic stays inside the code that owns the resource.
- [ ] 15.4.4 (L3) Resource allocation prevents thread starvation (thread pools, fair access).

(note) Treat a race on a security decision or a balance/quota check as a security bug at any level; use transactions or atomic conditional updates.

## V16 Security logging and error handling

### Logging
- [ ] 16.1.1 (L2) Keep an inventory of logging per layer: events logged, format, storage location, use, access control, retention.
- [ ] 16.2.1 (L2) Each entry has metadata for timeline investigation: when, where, who, what.
- [ ] 16.2.2 (L2) Time-synchronised sources; timestamps in UTC or with explicit offset (UTC recommended).
- [ ] 16.2.3 (L2) Logs go only to the files and services in the inventory.
- [ ] 16.2.4 (L2) Logs are readable and correlatable by the log processor; prefer a common structured format (e.g. JSON).
- [ ] 16.2.5 (L2) Logging of sensitive data follows its protection level: some data never (credentials, payment details), some only hashed or masked (session tokens).
- [ ] 16.3.1 (L2) Log all authentication operations, successes and failures, with metadata such as method or factors used.
- [ ] 16.3.2 (L2) Log failed authorization attempts. (L3: log all authorization decisions, including access to sensitive data, without logging the data itself.)
- [ ] 16.3.3 (L2) Log the security events defined in your documentation and attempts to bypass input validation, business logic and anti-automation controls.
- [ ] 16.3.4 (L2) Log unexpected errors and security-control failures (e.g. backend TLS failures).
- [ ] 16.4.1 (L2) Encode log data to prevent log injection: use structured formats, bound field length, neutralise CR/LF and delimiters; keep message templates constant (no string concatenation of user input into the template).
- [ ] 16.4.2 (L2) Logs are protected from unauthorized access and cannot be modified (read-only copy, tamper detection, access to logs itself recorded, read privileges reviewed).
- [ ] 16.4.3 (L2) Ship logs securely to a logically separate system so a breach of the app does not compromise them.
- [ ] Do not log: source code, session IDs (hash instead), access tokens, passwords, connection strings, encryption keys, payment data, sensitive personal data (e.g. health, government IDs), data the user did not consent to or opted out of. Pseudonymise or delete identifiers where identity is not required (Logging cheat sheet).
- [ ] Logging failure must not stop the app or leak information; logs cannot fill the disk (rate/size limits); log-driven lockouts cannot be abused to lock out other users.
- [ ] Do not discard an event because one field is malformed: replace the field, record the validation failure with bounded safe context.
- [ ] Disposal: keep logs for the required retention period, not beyond; includes debug logs and backups.
- Alerting/SIEM is out of ASVS scope but logs must be shippable to it.

### Error handling
- [ ] 16.5.1 (L2) Return a generic message on unexpected or security-sensitive errors: no stack traces, queries, keys, tokens, paths or versions.
- [ ] 16.5.2 (L2) Keep operating securely when an external resource fails (circuit breaker, graceful degradation).
- [ ] 16.5.3 (L2) Fail closed: an exception must never lead to processing a transaction or granting access anyway (no fail-open after a validation error).
- [ ] 16.5.4 (L3) A last-resort handler catches all unhandled exceptions, logs the details and keeps the process alive. In languages without exceptions (e.g. Swift, Go) use an equivalent pattern.
- [ ] Use one global error handler; use 5xx only for genuinely unexpected failures, and map expected failures to specific 4xx codes.

## V17 WebRTC (pointer)
Read ASVS 5.0 chapter V17 (`0x26-V17-WebRTC.md` in the ASVS repository) if you use WebRTC.
It has three sections: V17.1 TURN server, V17.2 media, V17.3 signaling.
Not distilled here; do not claim WebRTC security without reading it.

## How to verify
- Crypto: grep the code and dependencies for banned primitives (MD5, SHA-1 for security, DES/3DES, RC4, ECB, `Math.random`/language PRNG near tokens); confirm password hashing parameters against the table; check the crypto inventory exists.
- TLS: scan every public endpoint (e.g. testssl.sh, SSL Labs candidates); confirm TLS 1.0/1.1 and plaintext HTTP are off or redirect; check internal and database connections also use TLS with certificate validation on.
- Secrets: run a secrets scanner over the working tree and git history (candidates: gitleaks, trufflehog, detect-secrets); inspect built images and artifacts for baked-in secrets; check the vault access policy is least privilege.
- Config: request `/.git/config`, a debug route, a directory path, `TRACE /` and API docs/metrics on production; all must fail.
- Data: list sensitive fields, then check each against URL parameters, logs, caches, browser storage, analytics calls and error responses.
- Dependencies: run an SCA/audit tool (candidates: OSV-Scanner, `npm audit`, `pip-audit`, Dependabot) and compare findings to the remediation time frames; generate an SBOM (CycloneDX or SPDX).
- Logging/errors: trigger a login failure, an authorization failure, a malformed input and an unhandled exception; confirm each log entry exists with who/when/what, that the response is generic, and that no secret or personal data appears in the log. Inject CR/LF into an input and confirm no forged entry.

## Common mistakes
- Treating UUIDs or timestamps as unguessable tokens; using `Math.random()`-style PRNGs for IDs, resets or keys.
- AES without authentication (CBC/CTR/ECB), reused nonces with GCM, hard-coded or default keys, key stored next to the ciphertext.
- Fast hash (SHA-256 alone) for passwords; argon2id with parameters below the table minimums.
- Secrets in `.env` committed, in Docker `ENV`/`ARG`, in CI logs, in client-side bundles or mobile app binaries.
- TLS verification disabled in a client "temporarily"; plaintext to the database inside the "private" network.
- Verbose error pages, debug mode, open API docs or metrics endpoints left on in production.
- Whole database entities serialised to the API, or request bodies bound straight onto models (mass assignment).
- Logging request bodies, tokens or personal data; logging concatenated user input; logs on the same host and writable by the app.
- Catch-and-continue that grants access or commits a transaction after a failed check.

## Sources
- OWASP ASVS 5.0.0 (May 2025), chapters V11-V17 and Appendix C; git master checkout `9ccce0e3cf47abd6a412fc8a8deadd7fd6da501f` (2026-10-26). Licence CC BY-SA 4.0. https://github.com/OWASP/ASVS
- OWASP Cheat Sheet Series, commit `1abd8667e9311f7ae54eb9be8fc1e28cc6a15de9` (2026-11-01): Cryptographic Storage, Secrets Management, Logging, Error Handling, Database Security. Licence CC BY-SA 4.0. https://cheatsheetseries.owasp.org
- Rewritten and condensed by an AI agent; not an official OWASP text. ASVS 5.0 was the current release on 2026-11-02 as far as these sources show.
