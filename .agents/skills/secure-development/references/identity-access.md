# Identity and access: authentication, sessions, authorization, tokens, OAuth/OIDC, data isolation

## When to read this
Read when you design, write, review or verify anything that identifies a user or service (login, registration, password reset, MFA, sessions, API tokens, JWT, OAuth/OIDC, single sign-on) or decides who may see or change what (roles, ownership, tenants, admin functions). Stack-neutral. Level tags are OWASP ASVS 5.0: L1 = baseline for every app, L2 = standard for apps holding user data (default target), L3 = high assurance. Lines marked (note) are not from the sources.

## 0. Decision first: use a managed identity provider
(note) Do not build credential handling yourself (password storage, reset flows, MFA, session or token issuing, OAuth server). Delegate to an established managed identity provider or a mature, maintained identity library/server (candidates: a cloud identity service, a self-hostable OIDC server, a framework's official auth module), then configure it to the checklists below. Your code keeps only: validating the tokens or sessions it receives, mapping the verified identity to a local user id, and authorization. ASVS V10 itself states that a secure OAuth/OIDC solution must use a well-known industry-standard authorization server with the recommended configuration. Home-made credential handling is justified only with a documented reason, and then every V6/V7 item below is yours to implement and test.

## 1. V6 Authentication

### 6.1 Documentation
- [ ] 6.1.1 (L1) Document how rate limiting, anti-automation and adaptive response defend against credential stuffing and password brute force, how they are configured, and how malicious account lockout is prevented.
- [ ] 6.1.2 (L2) Document a list of context-specific words (organization, product, system, project codename, role names and permutations) that must not appear in passwords.
- [ ] 6.1.3 (L2) If there are several authentication pathways, document them all with the controls and authentication strength to enforce consistently.

### 6.2 Passwords
- [ ] 6.2.1 (L1) Minimum length 8 characters; at least 15 strongly recommended.
- [ ] 6.2.2 (L1) Users can change their password.
- [ ] 6.2.3 (L1) Password change requires current and new password.
- [ ] 6.2.4 (L1) At registration and change, check the password against at least the top 3000 passwords that satisfy your policy (e.g. length).
- [ ] 6.2.5 (L1) Any characters allowed; no composition rules (no mandatory upper/lower/digit/special).
- [ ] 6.2.6 (L1) Password fields use type=password (temporary reveal allowed).
- [ ] 6.2.7 (L1) Paste, browser password helpers and external password managers are allowed.
- [ ] 6.2.8 (L1) Verify the password exactly as received: no truncation, no case change.
- [ ] 6.2.9 (L2) Passwords of at least 64 characters are accepted.
- [ ] 6.2.10 (L2) No periodic forced rotation; change only on suspected compromise or user choice.
- [ ] 6.2.11 (L2) Enforce the documented context-specific word list (6.1.2).
- [ ] 6.2.12 (L2) Check new passwords against a set of breached passwords.

### 6.3 General authentication
- [ ] 6.3.1 (L1) Credential stuffing and brute-force controls are implemented as documented.
- [ ] 6.3.2 (L1) No default accounts ("root", "admin", "sa"), or they are disabled.
- [ ] 6.3.3 (L2) Access requires MFA or a combination of single-factor mechanisms. (L3: one factor is hardware-based, phishing-resistant and requires a user action, e.g. FIDO key button press; relaxing needs a documented rationale and mitigations.)
- [ ] 6.3.4 (L2) With several authentication pathways: no undocumented pathway; same controls and strength everywhere (including API, mobile, legacy endpoints).

### 6.4 Factor lifecycle and recovery
- [ ] 6.4.1 (L1) System-generated initial passwords/activation codes: securely random, follow the password policy, expire shortly or on first use, and never become the long-term password.
- [ ] 6.4.2 (L1) No password hints and no knowledge-based "secret questions".
- [ ] 6.4.3 (L2) Forgotten-password reset is secure and does not bypass enabled MFA.
- [ ] 6.4.4 (L2) Lost MFA factor: identity proofing at the same level as at enrollment.

### 6.5 Multi-factor mechanisms (lookup secrets, OOB, TOTP)
- [ ] 6.5.1 (L2) Lookup secrets, OOB requests/codes and TOTP are usable successfully only once.
- [ ] 6.5.2 (L2) Stored lookup secrets with less than 112 bits of entropy (19 random alphanumerics or 34 random digits) are hashed with an approved password hashing algorithm plus a 32-bit random salt; a standard hash is enough at 112 bits or more.
- [ ] 6.5.3 (L2) Lookup secrets, OOB codes and TOTP seeds come from a CSPRNG.
- [ ] 6.5.4 (L2) Lookup secrets and OOB codes have at least 20 bits of entropy (4 random alphanumerics or 6 random digits).
- [ ] 6.5.5 (L2) OOB requests/codes/tokens and TOTP have a lifetime: OOB at most 10 minutes, TOTP at most 30 seconds.

### 6.6 Out-of-band
- [ ] 6.6.1 (L2) Phone/SMS (PSTN) OTP only for a previously validated number, with stronger alternatives (e.g. TOTP) also offered and the risks explained. L3: phone/SMS not available at all. Email and VOIP are not acceptable OOB channels.
- [ ] 6.6.2 (L2) OOB request/code/token is bound to the original authentication request; not usable for an earlier or later one.
- [ ] 6.6.3 (L2) Code-based OOB is protected against brute force by rate limiting; consider codes with at least 64 bits of entropy.

### 6.8 Authentication with an identity provider (IdP)
- [ ] 6.8.1 (L2) With several IdPs, a user cannot be spoofed through another IdP: identify the user by IdP id (namespace) plus the user's id at that IdP.
- [ ] 6.8.2 (L2) Always validate presence and integrity of signatures on assertions (JWT, SAML); reject unsigned or invalid ones.
- [ ] 6.8.3 (L2) SAML assertions are processed once and only within their validity period (replay defence).
- [ ] 6.8.4 (L2) If specific authentication strength/method/recency is needed, verify it from IdP data (OIDC `acr`, `amr`, `auth_time`); if the IdP gives none, document a fallback that assumes the weakest mechanism (single-factor password).

### V6 L3 (grouped)
6.3.5 notify users of suspicious authentication attempts; 6.3.6 email is not an authentication factor; 6.3.7 notify users after credential/username/email changes; 6.3.8 valid users cannot be deduced from error text, HTTP codes or timing, including in registration and forgot-password; 6.4.5 send renewal instructions for expiring authenticators early enough, with automated reminders; 6.4.6 admins can start a password reset but cannot choose or see the user's password; 6.5.6 any factor (including physical devices) can be revoked after loss or theft; 6.5.7 biometrics only as a secondary factor; 6.5.8 TOTP time comes from a trusted server-side source; 6.6.4 rate-limit MFA push notifications (push bombing), number matching helps; 6.7.1 certificates used to verify cryptographic authentication assertions are protected from modification; 6.7.2 challenge nonce at least 64 bits and unique.

## 2. V7 Session management

### 7.1 Documentation
- [ ] 7.1.1 (L2) Document the inactivity timeout and absolute maximum session lifetime with justification for deviating from NIST SP 800-63B re-authentication rules.
- [ ] 7.1.2 (L2) Document how many concurrent sessions an account may have and what happens at the limit.
- [ ] 7.1.3 (L2) Document every system that creates/manages sessions in a federated setup (SSO) and how lifetimes, termination and re-authentication are coordinated.

### 7.2 Fundamentals
- [ ] 7.2.1 (L1) Session token verification is done by a trusted backend service.
- [ ] 7.2.2 (L1) Session tokens are dynamically generated (reference or self-contained), never static API secrets/keys.
- [ ] 7.2.3 (L1) Reference tokens are unique, from a CSPRNG, with at least 128 bits of entropy.
- [ ] 7.2.4 (L1) New session token on every authentication including re-authentication; terminate the old one.

### 7.3 Timeout
- [ ] 7.3.1 (L2) Inactivity timeout enforces re-authentication per risk analysis and documented decisions.
- [ ] 7.3.2 (L2) Absolute maximum lifetime enforces re-authentication per documented decisions.

### 7.4 Termination
- [ ] 7.4.1 (L1) After logout/expiry the session cannot be used again. Stateful: invalidate server-side. Self-contained tokens: denylist of terminated tokens, reject tokens issued before a per-user timestamp, or rotate a per-user signing key.
- [ ] 7.4.2 (L1) Disabling or deleting an account terminates all its active sessions.
- [ ] 7.4.3 (L2) After a change or removal of any authentication factor (password change/reset, MFA change), offer to terminate all other sessions.
- [ ] 7.4.4 (L2) Every authenticated page has easy, visible logout.
- [ ] 7.4.5 (L2) Admins can terminate sessions of one user or of all users.

### 7.5 Abuse defences
- [ ] 7.5.1 (L2) Full re-authentication before changing sensitive attributes (email, phone, MFA configuration, recovery info).
- [ ] 7.5.2 (L2) Users can list their active sessions and terminate any or all of them (after re-authenticating with at least one factor).

### 7.6 Federated re-authentication
- [ ] 7.6.1 (L2) Session lifetime and termination between relying party and IdP behave as documented (re-authenticate when the maximum time between IdP authentications is reached).
- [ ] 7.6.2 (L2) Creating a session needs user consent or an explicit user action; no silent session creation.

### V7 L3
7.5.3 require another factor or secondary verification before highly sensitive transactions.

## 3. V8 Authorization

### 8.1 Documentation
- [ ] 8.1.1 (L1) Document the rules restricting function-level and data-specific access by consumer permissions and resource attributes.
- [ ] 8.1.2 (L2) Document field-level read and write rules (they may depend on object state/status).

### 8.2 Design
- [ ] 8.2.1 (L1) Function-level access is limited to consumers with explicit permission.
- [ ] 8.2.2 (L1) Data-specific access is limited to consumers with explicit permission on those items (prevents IDOR/BOLA).
- [ ] 8.2.3 (L2) Field-level access is limited to consumers with explicit permission on those fields (prevents BOPLA, e.g. mass assignment of `role` or `owner_id`, or leaking internal fields in responses).

### 8.3 Operation level
- [ ] 8.3.1 (L1) Authorization is enforced in a trusted service layer, never in controls an untrusted client can manipulate (client-side JavaScript).

### 8.4 Other
- [ ] 8.4.1 (L2) Multi-tenant apps have cross-tenant controls so one tenant's operations never affect tenants they have no permission for.

### V8 L3 (grouped)
8.1.3/8.1.4 document the environmental/contextual attributes (time, location, IP, device) used in decisions, thresholds and actions (allow, challenge, deny, step-up); 8.2.4 apply adaptive controls at session start and during the session; 8.3.2 authorization changes apply immediately, otherwise (self-contained tokens) mitigate with alerting and reverting actions by no-longer-authorized consumers; 8.3.3 decide access on the originating subject's permissions, not an intermediary service's (pass the user's token downstream, not a service-to-service token); 8.4.2 admin interfaces use layered controls (continuous identity verification, device posture, contextual risk), never network location alone.

## 4. V9 Self-contained tokens (JWT, SAML assertions, similar)
- [ ] 9.1.1 (L1) Validate signature or MAC before trusting any content.
- [ ] 9.1.2 (L1) Per context, only allowlisted algorithms may create/verify tokens; ideally only symmetric or only asymmetric; never `None`. If both must be supported, add key-confusion controls.
- [ ] 9.1.3 (L1) Verification keys come from trusted pre-configured sources for the issuer; for JWS validate `jku`, `x5u`, `jwk` headers against an allowlist of trusted sources.
- [ ] 9.2.1 (L1) If the token has a validity span, accept only inside it (JWT: verify `nbf` and `exp`).
- [ ] 9.2.2 (L2) Check the token type and purpose (only access tokens for authorization decisions, only ID Tokens as proof of authentication).
- [ ] 9.2.3 (L2) Accept only tokens meant for this service: validate `aud` against an allowlist.
- [ ] 9.2.4 (L2) An issuer that signs for several audiences with one private key puts a unique audience restriction in each token; if audience ids are provisioned dynamically, the issuer validates them to prevent audience impersonation.

## 5. V10 OAuth 2.0 and OpenID Connect
Roles: client (a backend client is usually confidential; a browser/mobile client is public), resource server (RS = your API), authorization server (AS), OpenID Provider (OP), relying party (RP). Access tokens go only to the RS, refresh tokens only to the issuing AS, ID Tokens only to the client that started the flow. OAuth alone is not user authentication; OIDC adds it.

### 10.1 Generic
- [ ] 10.1.1 (L2) Tokens go only to components that strictly need them (for browser apps use a backend-for-frontend (BFF) so access and refresh tokens never reach the browser).
- [ ] 10.1.2 (L2) The client accepts authorization-server values (code, ID Token) only from a flow started by the same user-agent session and transaction; PKCE `code_verifier`, `state`, `nonce` are unguessable, per transaction, and bound to client and user-agent session.

### 10.2 Client
- [ ] 10.2.1 (L2) Code flow has CSRF protection: PKCE or the `state` parameter.
- [ ] 10.2.2 (L2) A client using more than one AS defends against mix-up attacks (e.g. require `iss` in the authorization and token responses and validate it).

### 10.3 Resource server
- [ ] 10.3.1 (L2) Accept only access tokens intended for this service (audience; `aud` claim or introspection).
- [ ] 10.3.2 (L2) Authorization decisions use the delegated-authorization claims present (`sub`, `scope`, `authorization_details`).
- [ ] 10.3.3 (L2) Identify a user from claims that cannot be reassigned: combine `iss` and `sub`.
- [ ] 10.3.4 (L2) If specific authentication strength/method/recency is required, verify it from the token (`acr`, `amr`, `auth_time`).

### 10.4 Authorization server
- [ ] 10.4.1 (L1) Redirect URIs checked against a client-specific allowlist of pre-registered URIs by exact string comparison.
- [ ] 10.4.2 (L1) An authorization code works once; reuse is rejected and the tokens issued from it are revoked.
- [ ] 10.4.3 (L1) Authorization code lifetime at most 10 minutes (L1/L2), at most 1 minute (L3).
- [ ] 10.4.4 (L1) A client may use only the grants it needs; grants `token` (Implicit) and `password` (Resource Owner Password Credentials) must not be used.
- [ ] 10.4.5 (L1) Refresh token replay is mitigated for public clients: preferably sender-constrained (DPoP or mTLS certificate-bound); for L1/L2 rotation is acceptable (invalidate the token after use; if a used one is presented, revoke all refresh tokens of that grant).
- [ ] 10.4.6 (L2) Code grant requires PKCE: valid `code_challenge` required, `code_challenge_method` `plain` refused, `code_verifier` validated at the token request.
- [ ] 10.4.7 (L2) Unauthenticated dynamic client registration is hardened: validate client metadata/URIs, ensure consent, warn the user about untrusted clients.
- [ ] 10.4.8 (L2) Refresh tokens have an absolute expiration, also when sliding expiration is used.
- [ ] 10.4.9 (L2) Users can revoke refresh tokens and reference access tokens in the AS UI.
- [ ] 10.4.10 (L2) Confidential clients authenticate on back-channel requests (token, pushed authorization request (PAR), revocation).
- [ ] 10.4.11 (L2) Each client is assigned only the scopes it requires.

### 10.5 OIDC client
- [ ] 10.5.1 (L2) Mitigate ID Token replay (e.g. `nonce` in the ID Token equals the `nonce` sent).
- [ ] 10.5.2 (L2) Identify the user from non-reassignable ID Token claims, usually `sub` (scoped to the IdP).
- [ ] 10.5.3 (L2) Reject authorization-server metadata whose issuer URL does not exactly match the pre-configured issuer.
- [ ] 10.5.4 (L2) ID Token `aud` equals the client's `client_id`.
- [ ] 10.5.5 (L2) Back-channel logout: logout token has type `logout+jwt`, contains the `event` claim with the correct member name, contains no `nonce`; short expiry (e.g. 2 minutes) recommended.

### 10.6 OpenID Provider
- [ ] 10.6.1 (L2) Allowed response values only `code`, `ciba`, `id_token`, `id_token code`; prefer `code`; never `token`.
- [ ] 10.6.2 (L2) Forced-logout DoS is mitigated (explicit user confirmation, or validate parameters such as `id_token_hint`).

### 10.7 Consent
- [ ] 10.7.1 (L2) User consents to each authorization request; if client identity cannot be assured, always prompt.
- [ ] 10.7.2 (L2) Consent screen states what is granted (scope, resource server, authorization details), to which application, and for how long.
- [ ] 10.7.3 (L2) Users can review, modify and revoke consents.

### V10 L3 (grouped)
10.2.3 client requests only the scopes it needs; 10.3.5 RS requires sender-constrained access tokens (mTLS or DPoP); 10.4.12 restrict `response_mode` per client (validate, or use PAR/JAR); 10.4.13 code grant always with PAR; 10.4.14 AS issues only sender-constrained tokens (mTLS or DPoP); 10.4.15 `authorization_details` must come from the client backend untampered (PAR or JAR); 10.4.16 confidential client with strong client authentication (`tls_client_auth`, `self_signed_tls_client_auth`, `private_key_jwt`).

## 6. Practical patterns (OWASP Cheat Sheet Series)

### Passwords and storage
- Hash with a slow, salted password hash. Preferred: Argon2id, minimum m=19456 (19 MiB), t=2, p=1; equivalent trade-offs listed: m=47104 t=1; m=12288 t=3; m=9216 t=4; m=7168 t=5 (all p=1; the first two, m=47104 and m=19456, must not be used with Argon2i). If Argon2id is unavailable: scrypt N=2^17 r=8 p=1 (or N=2^16 p=2, N=2^15 p=3, N=2^14 p=5, N=2^13 p=10, r=8). Legacy bcrypt: work factor 10 or more, input limit 72 bytes (enforce it, never silently truncate). FIPS-140 required: PBKDF2 with HMAC-SHA-256, 600,000 iterations (HMAC-SHA-512: 220,000; HMAC-SHA-1 1,400,000 is legacy only).
- Tune the work factor on your own hardware (a hash should take under about 1 second, but a high value also makes login a DoS target). Store the work factor with the hash and re-hash on next successful login to upgrade.
- Optional pepper (shared secret, stored outside the database, in a vault/HSM) as extra defence in depth; changing it forces password resets. (note) Compare hashes with the library's constant-time verify function, with a maximum input length and explicit types.
- Passwords: minimum length 8 with MFA, 15 without; allow at least 64; all Unicode and whitespace; block breached/common passwords (e.g. the Pwned Passwords service or a local copy); no composition rules; no periodic rotation; strength meter optional. Send credentials only over TLS.
- Do not allow sensitive internal accounts (backend, middleware, database) to log in through the public front end.
- User ids: prefer randomly generated ids, not sequential. Email as username is fine if verified at sign-up.

### Login, errors, throttling
- Same generic message and HTTP response for login, reset and registration whether the id is wrong, the account does not exist, or it is locked. Make timing equal too: avoid the "quick exit" when the user is not found (do the same hashing work or use asynchronous handling).
- Count failed attempts per account, not only per IP (attackers rotate IPs). Define threshold, observation window and lockout duration; exponential back-off (start around 1 second, doubling) avoids permanent lock-outs. Do not let lockout become a DoS against known usernames: forgot-password must still work. CAPTCHA only as an extra, after a few failures; it is weak alone.
- Attack types to cover: brute force (many passwords, one account), credential stuffing (breached pairs), password spraying (one weak password, many accounts). MFA is the strongest single defence.
- Log all failures, password failures and lockouts, and review them.
- Re-authenticate (with a bound authenticator such as current password or passkey, never security questions) before sensitive actions and after risk events: suspicious activity, account recovery, critical actions (changing payment details, adding trusted devices).
- Changing the registered email: verify identity first (MFA, or current password without MFA), keep the new address as a pending change, send time-limited nonce links: with MFA, a notification-only mail to the old address plus a confirmation mail to the new one; without MFA, a confirmation mail to both.
- Federated account linking: key the link on `iss` plus `sub`; never auto-link on matching email or username; require an authenticated session with the existing account to add or remove a linked identity, validate the ID Token before saving, notify the user.

### MFA
- Prefer phishing-resistant authenticators (FIDO2/WebAuthn passkeys, bound to the origin); then TOTP; avoid SMS/voice (SIM swap) and email. Push: number matching plus rate limits and anomaly monitoring.
- Defend against downgrade: disable legacy protocols/endpoints that cannot enforce MFA; no fallback from phishing-resistant to weaker methods without documented policy.
- Prefer hardware-backed non-exportable keys; validate attestation where policy requires.
- OTP codes: single use, short lifetime, stored hashed, rate-limited per account. MFA reset needs identity proofing equal to enrollment (6.4.4); on suspicion, invalidate sessions and notify on all registered channels.
- (note) Failed MFA attempts count toward the same throttling as the password step.

### Password reset and recovery
- Same response and timing for existing and unknown accounts; rate-limit requests per account (otherwise the user's inbox gets flooded).
- Token: CSPRNG, long enough against brute force, linked to one user, stored securely (hashed), single use, short expiry; rate-limit token guesses. Build reset URLs from a hard-coded or allowlisted host (never the request `Host` header), HTTPS only, set `Referrer-Policy: no-referrer` on the reset page. PIN alternative: 6 to 12 digits via side channel, creating a limited session that can only reset the password.
- Do not change the account (e.g. lock it) until a valid token is presented. User types the new password twice, same policy as elsewhere, then logs in normally (no automatic login). Send a notification that the password changed (never the password). Offer or force invalidation of existing sessions.
- Security questions: the Forgot Password sheet allows them as an extra layer, but ASVS 6.4.2 (L1) forbids them. Follow ASVS: do not use them.
- After suspected compromise, a password reset alone is not enough: also remove attacker-added recovery data and MFA methods, do not auto-restore superseded recovery contacts, invalidate sessions and outstanding reset links.

### Sessions and cookies
- Session id: CSPRNG, at least 64 bits of entropy per the cheat sheet (ASVS 7.2.3 demands 128 bits for reference tokens: use 128 or more, 160 preferred). The whole id must be random. Store only a verifier/hash server-side if read access to the store is in your threat model.
- Regenerate the id on login and on any privilege change (password change, role switch); invalidate the old one; also pre-authentication renewal to prevent fixation.
- Cookie: `Set-Cookie: __Host-SessionID=<value>; Secure; HttpOnly; SameSite=Strict; Path=/` (no `Domain` attribute). `SameSite=Strict` preferred, `Lax` acceptable, set explicitly, never `None` without `Secure`; SameSite is defence in depth, keep CSRF tokens. Non-persistent cookie (no `Expires`/`Max-Age`) for sessions.
- Never keep session ids, JWTs or refresh tokens in `localStorage`/`sessionStorage` (any XSS reads them); use HttpOnly cookies or a BFF. Do not put session ids in URLs.
- Timeouts, server-side: idle 2-5 minutes for high-value apps, 15-30 minutes for low risk; absolute commonly 4-8 hours for a workday app; optional renewal timeout. Browser-close events and client timers are only a convenience. Logout invalidates server-side and clears the cookie (empty value, past expiry).
- Log session creation, use anomalies and destruction without logging the full id.

### Authorization and IDOR
- Least privilege (horizontal and vertical); for each user type and resource, decide each operation up front and test it. Review periodically for privilege creep.
- Deny by default, explicit configuration rather than framework defaults. Check permission on every request (including AJAX, static files, downloads, exports, background jobs) through a global mechanism (middleware/filter/policy layer), not per-handler ad hoc code. Never trust client-side checks.
- Prefer attribute-based (ABAC) and relationship-based (ReBAC: "the owner of this post") models over pure roles (RBAC) once object-level rules appear; RBAC alone suffers role explosion and fits multi-tenancy poorly.
- IDOR: check the specific object on every request; do not rely on unguessable ids (UUIDs are defence in depth only). Look objects up inside the caller's own scope: `current_user.projects.find(id)`, not `Project.find(id)`. Where possible derive the object from the session instead of accepting an id.
- On denial: fail closed, one central handler, no stack traces or object details in the response, log the denial. Third-party auth components: read their defaults, test configuration, keep defence in depth.
- IDOR test recipe: create users A and B with their own objects; as A, request B's objects by changing ids in path, query, body and headers; expect denial for every operation (read, create, update, delete, export, admin action).

### JWT
- Verify with a fixed algorithm allowlist set by the server (e.g. ES256 with a public key); never take `alg` from the token header; refuse `none`. Do not mix symmetric and asymmetric for one key (key confusion: the public key used as an HMAC secret).
- Key selection: take keys only from the issuer's configured JWKS (`jwks_uri` from trusted metadata) or pinned keys; `kid` only selects within that set and must be sanitized (injection vector); never trust key material in `jwk`, `jku`, `x5u`, `x5c` unless it chains to a pre-trusted anchor. Fetch of key URLs: guard against SSRF.
- Require and check `exp`, `iss` (exact, case-sensitive string; allowlist if several issuers), `aud` (your own identifier present); select the key set bound to the validated `iss`, never the union of several issuers' keys. In PyJWT-like libraries the `issuer`/`audience` arguments must actually be passed, otherwise nothing is checked. Require claims explicitly (`options={"require": ["exp","iss","aud"]}` style).
- Separate token kinds: explicit `typ` (e.g. `at+jwt`, `logout+jwt`, a custom one for internal tokens) validated at the verifier, or separate keys/claims/`iss`+`aud` per kind, so a reset or ID token cannot be used as an access token.
- HS* secrets must be long random values dedicated to one purpose. Short `exp`; revocation by token status list, per-user "valid after" timestamp, or denylist keyed by `iss`+`jti` (never by raw token or its hash: JWT/ECDSA malleability allows bypass).
- A signed JWT is readable by anyone holding it: keep sensitive data out or use an opaque reference token; JWE only if claims must travel confidentially, then nested sign-then-encrypt, validate both layers, allowlist `alg`/`enc`, no `zip`.

### OAuth 2.0 / OIDC
- Authorization Code grant with PKCE for all client types (also SPAs and native apps); Implicit (`response_type=token`) and Resource Owner Password Credentials are deprecated: do not use. Use S256 style challenge methods that do not expose the verifier.
- Exact redirect URI matching; no open redirectors in client or AS; no `http` redirect URIs except loopback for native clients; do not forward requests that may contain credentials.
- CSRF: PKCE, or OIDC `nonce`, or a one-time `state` bound to the user-agent session. AS rejects a `code_verifier` when no `code_challenge` was sent (downgrade).
- Multiple AS: use `iss` in the response (mix-up defence) or distinct redirect URIs per AS.
- Least-privilege tokens: minimum scopes, audience-restricted (ideally one resource server), restricted to resources/actions. Sender-constrain high-value or long-lived tokens with DPoP (RFC 9449, `cnf`/`jkt`) or mTLS certificate-bound tokens (RFC 8705); they limit replay, not disclosure. Refresh tokens: sender-constrained or rotated.
- Client authentication where possible, preferably asymmetric (mTLS, `private_key_jwt`). The AS must not let clients choose their `client_id`/`sub` values that could be confused with a real user.
- Current best practice reference: RFC 9700 (OAuth 2.0 Security BCP). OAuth 2.1 is still an IETF draft in ASVS' reference list.

## 7. Multi-user data isolation
Generic design for any app with more than one user or tenant. (note) unless tagged otherwise; ASVS 8.2.2 (L1), 8.2.3 (L2), 8.4.1 (L2) and the Multi-Tenant, IDOR and Authorization cheat sheets are the sourced parts.

### Rules
- [ ] (note) Every row of user-owned data has a non-null owner id (`owner_id`, or `tenant_id` plus `owner_id` in multi-tenant apps), set by the server from the verified identity, never from client input. Reject or ignore a client-supplied owner/tenant value on create and update (mass assignment).
- [ ] (note) Every read, update, delete, list, count, search, export, report and background-job query filters on the owner/tenant id taken from the verified session or token. Lookup by object id alone is a bug: look up by (id, owner).
- [ ] (note) Enforce the filter in one place all access passes through (repository/data-access layer, policy middleware, or database row-level security), not by hand in each handler. Add a second layer where possible (row-level security, separate schemas/databases) as defence in depth.
- [ ] (note) Deny by default: a new endpoint, table or field is inaccessible until a rule grants it. Missing owner context means error, never an unfiltered query.
- [ ] (note) A "not yours" object returns the same not-found (or generic denial) as a non-existent one, so ids cannot be probed. Unguessable ids are extra, never the control.
- [ ] (note) Client-supplied tenant ids are selectors only: verify the authenticated principal has a current membership in that tenant (Multi-Tenant sheet, section 1).
- [ ] (note) Other shared surfaces carry the owner/tenant too: cache keys (include tenant/user; authorize before reading the cache), file/object storage paths and access URLs, search indexes, queues and job payloads (the consumer re-authorizes; a tenant id in a message is not proof), logs, rate limits and quotas per tenant, exports and backups, analytics.
- [ ] (note) Cross-owner or cross-tenant operations (support, admin, reporting) are separate, explicitly authorized, audited code paths, never the ordinary request path with a filter removed.
- [ ] (note) Database: the app's request-path database role is not a superuser and has no row-security bypass; if row-level security is the boundary, set the tenant context per transaction (transaction-local), fail closed when it is missing, and test through the same role and connection pool the app uses (Multi-Tenant sheet).
- [ ] (note) Offboarding: deleting a user or tenant deletes or anonymizes all rows, files, caches and sessions, per a documented retention policy; tenant-only restores never overwrite shared data.

### Role model
- [ ] (note) Start with the smallest model that works: `user` (owns their own data) and `admin`; add roles only when a real distinction appears. Roles express functions; ownership/membership expresses which objects (combine RBAC with ownership checks, or ABAC/ReBAC).
- [ ] (note) Roles live server-side (or in a verified token claim with a freshness policy, see 8.3.2); a role claim in a client-editable place is never trusted. The last admin cannot be removed by accident; admin actions are logged and require re-authentication (7.5.1 style).
- [ ] (note) Document the matrix of role x resource x operation (8.1.1, 8.1.2) and keep it next to the tests.

### Authorization test matrix (per endpoint)
For every endpoint and operation, write automated tests with at least two seeded users (A and B, optionally a different tenant, and an admin). Expected results:

| Case | Expected |
| --- | --- |
| Owner (A) accesses A's object | allowed |
| Other user (B) accesses A's object by id | denied (same as not found) |
| Anonymous (no/expired/invalid credential) | denied (401) |
| User in another tenant | denied |
| Role without the function (e.g. normal user on admin route) | denied (403) |
| Admin/cross-tenant role | allowed only on the documented admin path, and logged |
| List/search/count/export as A | contains only A's rows |
| Create as A with `owner_id`/`tenant_id` of B in the body | ignored or rejected, row belongs to A |
| Update as A changing `owner_id`, `role`, or read-only fields | rejected (field-level) |
| Disabled/deleted user, revoked session, expired token | denied |

Run the matrix for read, create, update, delete, export and each admin action. Generate the endpoint list from the router/schema so a new endpoint without a test fails the build; for row-level security, discover tables from the schema and fail on a table without classification or policy (Multi-Tenant sheet, "Verify Tenant Isolation").

## 8. How to verify / common mistakes
- Try the matrix above by hand or in tests; use a second account for every object type.
- Search code for: object lookups by id only; handlers reading `owner_id`/`tenant_id`/`role` from the request body or headers; authorization done only in the UI; JWT decode without algorithm, issuer and audience arguments; `alg` read from the token; tokens in `localStorage`; cookie missing `HttpOnly`/`Secure`/`SameSite`; session id kept after login; different error text or timing for unknown users; reset tokens not single use; rate limits missing on login, reset and OTP endpoints; password max length below 64 or composition rules; `Host` header used to build reset links; admin routes protected only by network location.
- Check the live app: log in, log out, then replay the old session cookie/token (must fail); change password then check other sessions; request another user's id with each HTTP method.
- Common mistakes: trusting an unguessable id instead of a check; filtering the list endpoint but not the detail, export or count endpoints; checking at the controller but not in background jobs; caching a per-user response under a shared key; treating `email` as a stable identity from an IdP (use `iss`+`sub`); stopping at 401 for anonymous and forgetting 403/404 for logged-in wrong users.

## Sources
- OWASP Application Security Verification Standard 5.0, chapters V6 (`0x15-V6-Authentication.md`), V7 (`0x16-V7-Session-Management.md`), V8 (`0x17-V8-Authorization.md`), V9 (`0x18-V9-Self-contained-Tokens.md`), V10 (`0x19-V10-OAuth-and-OIDC.md`); git commit 9ccce0e3cf47abd6a412fc8a8deadd7fd6da501f (2026-10-26); CC BY-SA 4.0; https://github.com/OWASP/ASVS.
- OWASP Cheat Sheet Series, commit 1abd8667e9311f7ae54eb9be8fc1e28cc6a15de9 (2026-11-01), CC BY-SA 4.0, https://cheatsheetseries.owasp.org/: Authentication, Password Storage, Session Management, Authorization, Insecure Direct Object Reference Prevention, Multifactor Authentication, Forgot Password, JSON Web Token, OAuth2, Multi-Tenant Security. Rewritten and condensed; attribution to OWASP, not our own work. Not read in full: MFA and JWT sheets (skimmed relevant sections); Authorization Testing Automation sheet not used.
- Standards cited by the sources: NIST SP 800-63B/63C, RFC 9700, RFC 9449, RFC 8705, RFC 8725, RFC 9068. No source appeared superseded as of 2026-11-02; OAuth 2.1 remained a draft in the ASVS reference list. Section 0 and section 7 are mostly (note) material.
