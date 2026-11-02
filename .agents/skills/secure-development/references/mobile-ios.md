Read only if the project ships a native mobile client (iOS focus).
Android is not covered beyond the generic MASVS control rules.

# Mobile client security (OWASP MASVS 2.x + iOS)

## When to read this
- Designing, writing, reviewing or verifying an iOS (or other native mobile) app that talks to a backend or stores user data.
- The backend is NOT covered here: verify it against the web/API ASVS files. MASVS covers the client only.
- Assume the device, the network and the app binary are attacker-controlled. Every client-side check must also exist server-side.

## How MASVS 2.x works (read once)
- 24 controls in 8 groups: STORAGE(2) CRYPTO(2) AUTH(3) NETWORK(2) PLATFORM(3) CODE(4) RESILIENCE(4) PRIVACY(4). Control IDs: `MASVS-<GROUP>-<n>`.
- There are NO L1/L2 levels inside MASVS 2.x. Levels (old L1/L2/R) became "MAS Testing Profiles" (mas.owasp.org/Profiles), maintained with the MASTG/MASWE; applying them is a risk-based decision that must be justified and documented. The MASTG holds the per-OS test procedures.
- Tag used below: `[B]` = baseline, apply to every app; `[R]` = risk-based, decide and record in the decisions log (a skipped `[R]` item is fine if the reason is written down). The B/R split is (note) our reading of the old L1/R split, not text from the standard.
- (note) Verification = open-book review (code, docs, a test account per role). Tools alone cannot complete it.

## STORAGE
- [ ] MASVS-STORAGE-1 [B] Every piece of sensitive data the app intentionally stores is protected, whatever the location (app container, shared container, keychain, cloud-synced store).
  - (note) iOS: tokens, keys, secrets go in the Keychain, never in `UserDefaults`/plist/Core Data in clear text. Choose the strictest `kSecAttrAccessible*` class that still works: `WhenUnlocked` for foreground-only data, `AfterFirstUnlock` only when background tasks need it, add `ThisDeviceOnly` for secrets that must not migrate (these are excluded from backups restored to another device). Avoid the `Always` variants (deprecated since iOS 12; Apple: not recommended).
  - (note) iOS: file-level data uses a Data Protection class; default for third-party data is `NSFileProtectionCompleteUntilFirstUserAuthentication`, so set `NSFileProtectionComplete` explicitly for sensitive files.
  - (note) iOS: bulk sensitive data stored locally is encrypted with a key held in the Keychain or Secure Enclave. If the key derives from a password, use a password-based KDF with a unique random salt, never a raw or fast-hashed password.
- [ ] MASVS-STORAGE-2 [B] Sensitive data does not leak through side channels the developer can control.
  - iOS leak points to check: logs (`print`, `NSLog`, `os_log`/`Logger`: scalars are public by default, dynamic strings private; mark sensitive values `.private` explicitly and never `.public`), crash reports and analytics payloads, device/iCloud backups (exclude with `isExcludedFromBackup` / keep in Keychain `ThisDeviceOnly`), the app-switcher snapshot (cover the window in `sceneWillResignActive` / `applicationWillResignActive`), the system pasteboard (`UIPasteboard`; mark secrets local-only/expiring, never copy them), keyboard cache and autocorrect (`isSecureTextEntry`, `autocorrectionType = .no`), URL/response caches (`URLCache`, `NSURLCredentialStorage`), `WKWebView` data stores, notifications and widget/lock-screen content.

## CRYPTO
- [ ] MASVS-CRYPTO-1 [B] Use current strong algorithms and parameters, as defined by external standards, through the platform crypto API.
  - (note) iOS: CryptoKit / Security framework / CommonCrypto only. No home-made crypto, no MD5/SHA-1/DES/ECB for security purposes, no static or hard-coded IVs/keys, randomness from `SecRandomCopyBytes` or CryptoKit (never `rand()`/`random()` for secrets; `arc4random` is a CSPRNG on Apple platforms but prefer the former).
- [ ] MASVS-CRYPTO-2 [B] Keys are generated, stored, used and retired according to best practice; nothing secret is shipped in the binary.
  - (note) iOS: no keys, API secrets or credentials hard-coded in source, plists or the asset catalog (the IPA can be unzipped). Prefer Secure Enclave keys (`SecKeyCreateRandomKey` with `kSecAttrTokenIDSecureEnclave`; the private key never leaves the hardware; only P-256 EC keys are supported) with an access-control flag (`.biometryCurrentSet`, `.userPresence`) for keys that guard high-value operations. Plan key rotation and revocation.

## AUTH
- [ ] MASVS-AUTH-1 [B] Remote authentication/authorization uses standard protocols correctly; enforcement happens on the server.
  - (note) iOS: OAuth 2.x / OIDC with the system browser (`ASWebAuthenticationSession`) and PKCE, never an embedded web view for login. Do not store the user password: keep short-lived access tokens plus a revocable refresh token in the Keychain. Do not use spoofable identifiers (device name, `identifierForVendor`) as proof of identity. Load protected data only after server-side auth succeeds. Support remote logout/session revocation and expire sessions after inactivity.
- [ ] MASVS-AUTH-2 [B] Local authentication (biometrics, PIN) is implemented the platform way.
  - (note) iOS: use `LocalAuthentication` (`LAContext`) and always provide a fallback (device passcode). Tie biometrics to a Keychain/Secure Enclave item via `SecAccessControl` (`.biometryCurrentSet` / `.userPresence`), so the unlock is enforced by the OS and not by a boolean `evaluatePolicy` result that Frida can flip. Do not allow short PINs (e.g. 4 digits) as an app-level secret. Handle `LAError` cases (lockout, not enrolled, cancelled, passcode not set) explicitly; a changed biometric set invalidates `.biometryCurrentSet` keys, so plan re-enrollment.
- [ ] MASVS-AUTH-3 [B] Sensitive operations (change password/email, payments, export or delete all data) require extra authentication.
  - (note) iOS: re-authenticate (biometric or password) before them, server-verified where the operation is server-side. Sensitive App Intents / Shortcuts / Siri actions can run from the lock screen: set `authenticationPolicy = .requiresLocalDeviceAuthentication`; confirmation (`requestConfirmation()`) does not replace authentication or authorization. For legacy SiriKit use "Restricted While Locked". Do not use `isProtectedDataAvailable` as an auth check.

## NETWORK
- [ ] MASVS-NETWORK-1 [B] All traffic uses TLS with the platform defaults left intact; no code path weakens them.
  - (note) iOS: keep App Transport Security on. No `NSAllowsArbitraryLoads`; if an exception is unavoidable, a per-domain one under `NSExceptionDomains` with the reason recorded and an expiry date. Never override `URLSessionDelegate` trust evaluation to accept invalid/self-signed certs (`didReceive challenge` returning `.useCredential` blindly); check third-party SDKs and low-level APIs (`Network.framework`, sockets) for the same. Do not send sensitive data in URLs or via SMS. Debug-only proxy/cert bypasses must be compiled out of release builds.
  - (note) ATS (verified in Apple's docs, 2026-11-02): requires TLS 1.2+, ECDHE forward secrecy, AES-128/256, server cert RSA >= 2048 or ECC >= 256 bits with SHA-256+; applies to `URLSession`, NOT to `Network.framework` or raw sockets, where you own the security. Source: developer.apple.com/documentation/security/preventing-insecure-network-connections.
- [ ] MASVS-NETWORK-2 [R] Identity pinning for endpoints you control (certificate/public-key pinning).
  - iOS optional decision: prefer pinning the public key (SPKI hash) of an intermediate or a backup key via `NSPinnedDomains` in Info.plist (iOS 14+, (note)) or a `URLSession` trust check. Always ship at least one backup pin and a plan for rotation; a wrong pin bricks the app until an update. Pinning protects against rogue CAs; skip it when the threat model does not include that and record the decision. Pinning does not replace server-side authz.

## PLATFORM
- [ ] MASVS-PLATFORM-1 [B] IPC and entry points (URL schemes, universal links, app extensions, App Groups, pasteboard, share sheet, App Intents) expose only what is needed and treat input as untrusted.
  - (note) iOS: prefer universal links over custom URL schemes (any app can register a scheme). Host a correct `apple-app-site-association` file, restrict its `paths`, and validate every parameter received. A deep link must not skip authentication or the app lock: route unauthenticated users to login. Share App Group containers only with your own targets. Request only the permissions (camera, location, contacts, Health...) and entitlements you need; every `NS*UsageDescription` purpose string must be accurate and specific.
- [ ] MASVS-PLATFORM-2 [B] Web views are configured securely.
  - (note) iOS: use `WKWebView` (never `UIWebView`), load only trusted https content, keep JavaScript off unless needed, restrict `WKScriptMessageHandler` bridges to the minimum and validate their input and origin, disable file access from file URLs, limit navigation with `WKNavigationDelegate` allow-lists, use `ASWebAuthenticationSession` / `SFSafariViewController` for third-party pages.
- [ ] MASVS-PLATFORM-3 [B] The UI does not leak sensitive data.
  - (note) iOS: mask secret fields (`isSecureTextEntry`), hide content in the app-switcher snapshot, redact lock-screen notifications and widgets (`privacySensitive(_:)` plus redacted placeholders; widgets that must hide while locked need Data Protection `NSFileProtectionComplete` on the extension), react to screen recording / screenshot notifications (`UIScreen.isCaptured`, `userDidTakeScreenshotNotification`) for highly sensitive screens, no secrets in OTP/push preview text.

## CODE
- [ ] MASVS-CODE-1 [B] The app requires an up-to-date platform version (a sensible minimum OS deployment target; drop old OS versions that no longer get fixes).
- [ ] MASVS-CODE-2 [B] A mechanism exists to force an update when a critical vulnerability ships (server-published minimum version checked at launch; plan for App Store review lag).
- [ ] MASVS-CODE-3 [B] No third-party component with known vulnerabilities.
  - (note) iOS: pin and review SwiftPM / CocoaPods / Carthage dependencies, commit lock files (`Package.resolved`, `Podfile.lock`), scan them (candidates: OSV-Scanner, `osv.dev`, GitHub Dependabot), keep an SBOM, prefer few and maintained dependencies.
- [ ] MASVS-CODE-4 [B] All untrusted input (UI, deep links, pasteboard, files, push payloads, network responses, IPC) is validated and sanitized before use.
  - (note) iOS: parameterize SQL (SQLite/GRDB/Core Data predicates, no string concatenation), validate `Codable` decoding results and ranges, never feed untrusted data to `NSPredicate(format:)`/`NSKeyedUnarchiver` without secure coding (`requiresSecureCoding = true`), avoid `eval`-like JS injection into web views, guard string format, bounds and memory-unsafe code (`UnsafePointer`, C interop). Build release with debug off, no debug endpoints or test backdoors, compiler warnings and static analysis on.

## RESILIENCE (all `[R]`: apply in proportion to the value of the app, the data and the attacker; record the decision)
- [ ] MASVS-RESILIENCE-1 [R] Validate platform integrity (detect jailbreak).
  - (note) iOS: optional and proportionate. Jailbreak checks are bypassable heuristics (file existence, sandbox write test, URL schemes); use them only to reduce server-side risk (e.g. lower trust level, limit offline secrets), not as a hard security boundary. Do not rely on them to protect secrets: store secrets so they are safe even if the check is bypassed.
- [ ] MASVS-RESILIENCE-2 [R] Anti-tampering: signed release builds, runtime integrity validation.
  - (note) iOS: always sign with your distribution identity (baseline). Optional: App Attest (`DCAppAttestService`, iOS 14+) with server-side verification of attestation and assertions to know that requests come from a genuine app instance; DeviceCheck for per-device flags.
- [ ] MASVS-RESILIENCE-3 [R] Anti-static analysis: strip symbols, no secrets or sensitive logic strings in the binary, optional obfuscation.
  - (note) iOS: strip debug symbols in release; do not rely on obfuscation for confidentiality.
- [ ] MASVS-RESILIENCE-4 [R] Anti-dynamic analysis: detect debuggers/hooking/instrumentation, disable debug features in release.
  - (note) iOS: no `get-task-allow` entitlement in release; optional debugger (`P_TRACED`) and instrumentation checks. Treat as speed bumps only.

## PRIVACY
- [ ] MASVS-PRIVACY-1 [B] Minimize access to sensitive data and resources: request only what the feature needs, with informed consent; third-party SDKs must honour consent and collect nothing before it; know the SDK supply chain.
  - (note) iOS: ask permission in context (just-in-time) and work degraded when denied; request narrow scopes (approximate location, limited photo access, per-type HealthKit read/write sets). Audit every SDK for what it collects. Minimize PII, expire and delete it automatically.
- [ ] MASVS-PRIVACY-2 [B] Prevent identification of the user: pseudonymize/anonymize, keep "fingerprint-like" signals (device ID, IP, behavior) isolated to their purpose (e.g. fraud detection must not feed analytics).
  - (note) iOS: no IDFA/tracking without App Tracking Transparency consent; do not build fingerprints from required-reason APIs; do not put user identifiers in analytics events unless needed.
- [ ] MASVS-PRIVACY-3 [B] Be transparent about collection and use, including non-obvious or background collection; follow the platform's declaration rules.
  - (note) iOS: accurate App Store privacy "nutrition label"; ship `PrivacyInfo.xcprivacy` (keys `NSPrivacyTracking`, `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes` with approved reason codes for required-reason APIs); require manifests from third-party SDKs; specific, truthful `NS*UsageDescription` strings. (note) manifest keys verified at developer.apple.com/documentation/bundleresources/privacy-manifest-files (2026-11-02); Apple also requires manifests (and signatures) for listed commonly used SDKs.
- [ ] MASVS-PRIVACY-4 [B] Give the user control: view, export, correct and delete their data (in-app account deletion), change privacy settings, revoke consent; re-prompt and update disclosures when new data is needed.
  - (note) iOS: in-app account deletion is an App Store requirement for apps with account creation (note: Apple guideline 5.1.1(v), not re-verified); deleting must also remove Keychain items, local files, caches and server copies.

## iOS quick checklist (condensed, tick before release)
- [ ] Keychain items use the strictest accessibility class; secrets `ThisDeviceOnly`; no secrets in `UserDefaults`, plists, bundle, logs, backups.
- [ ] Sensitive files carry an explicit Data Protection class; sensitive files excluded from backup.
- [ ] App-switcher snapshot, pasteboard, keyboard cache, lock-screen/widget/notification content checked for leaks.
- [ ] ATS fully on; no arbitrary-loads; no custom trust override; debug bypasses absent in release; pinning decision recorded.
- [ ] Universal links validated (AASA file correct, params validated, auth enforced on deep-link targets); custom URL schemes treated as untrusted.
- [ ] Biometrics via `LAContext` + Keychain access control, with passcode fallback; re-auth for sensitive operations; App Intents protected.
- [ ] Release build: no debug entitlements, symbols stripped, dependencies scanned and locked, minimum OS and forced-update mechanism in place.
- [ ] Privacy manifest, purpose strings, ATT (if tracking), account deletion present and truthful.
- [ ] Jailbreak detection / App Attest decision recorded (apply only if the risk justifies it).

## Common mistakes
- Trusting a client-side check (biometric boolean, jailbreak flag, premium flag) without server enforcement.
- Using the default Keychain class or `UserDefaults` "because it's private to the app".
- Disabling ATS or certificate validation "temporarily" for testing and shipping it.
- Deep links or App Intents that reach protected screens or actions while locked/unauthenticated.
- Logging tokens or personal data (`print` survives in release; use `os_log` privacy levels).
- Pinning without a backup pin or rotation plan.

## Sources
- OWASP MASVS (github.com/OWASP/masvs, checkout of master, commit `bbe226fd17e6dab51927f392936deef31c816423`, 2026-09-21; `OWASP_MASVS.yaml` version field is a placeholder `vx.x.x`; the 24 controls in `controls/*.md`; `Document/03-Using_the_MASVS.md` for profiles). Changelog stops at v1.3 in-repo and points to GitHub Releases; the control structure is the 2.x refactor (2023). Latest tagged release: v2.1.0 (2024-01-18, GitHub Releases API, checked 2026-11-02). Licence CC BY-SA 4.0 (attribution: OWASP Foundation); control wording here is rewritten.
- OWASP Cheat Sheet Series, `Mobile_Application_Security_Cheat_Sheet.md` (commit `1abd8667e9311f7ae54eb9be8fc1e28cc6a15de9`, 2026-11-01), CC BY-SA 4.0. No iOS-only cheat sheet exists in the checkout; the iOS section of this one was used (Shortcuts, Siri, deep links, WidgetKit, Secure Enclave, App Attest).
- Apple (retrieved 2026-11-02): VERIFIED on support.apple.com/guide/security: Data Protection classes (secb010e978a) and Keychain data protection (secb0694df1a). Also VERIFIED via developer.apple.com JSON docs (2026-11-02): ATS requirements, privacy manifest keys, `NSPinnedDomains` (iOS 14+), `kSecAttrAccessibleAlways` deprecation. NOT VERIFIED: other `kSecAttrAccessible` details, App Store guideline numbers, os_log default privacy, Secure Enclave P-256 limit (from memory). All `(note) iOS:` bullets are Apple-platform knowledge, not MASVS text; Shortcuts/Siri/deep-link/WidgetKit/Secure Enclave/App Attest details follow the Cheat Sheet.
- MASVS has no L1/L2 levels any more; the `[B]/[R]` tags are ours. Superseding: check mas.owasp.org/MASVS and mas.owasp.org/Profiles for newer releases before claiming compliance.
