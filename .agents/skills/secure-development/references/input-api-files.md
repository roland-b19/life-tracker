# Input, output, web frontend, API and file handling (ASVS 5.0 V1-V5)

## When to read this
Read when you design, write, review or verify code that accepts or emits untrusted data: request parsing, database queries, HTML/JS rendering, redirects, outbound HTTP calls, HTTP APIs, cookies and browser headers, uploads/downloads and document or spreadsheet imports.
Target level: tick every `(L1)` and `(L2)` line; `L3` lines are grouped at the end of each chapter. A line marked `(note)` is not from the sources (general knowledge): verify before relying on it.
Checklist format: `- [ ] <ASVS id> (L<n>) rule`. Items that are not applicable (e.g. no LDAP, no GraphQL, no WebSocket, no browser UI) are marked N/A with a reason, never silently skipped.

---

## V1 Encoding and Sanitization
Objective: untrusted data must never be interpreted as syntax by an interpreter (SQL, shell, HTML, JS, URL, XML, template...); prefer safe APIs (parameters, auto-escaping), otherwise encode at the last moment before the interpreter, otherwise sanitize.

### V1.1 Architecture
- [ ] 1.1.1 (L2) Decode/unescape input to canonical form exactly once, only when encoded data is expected, and BEFORE validation/sanitization (never after).
- [ ] 1.1.2 (L2) Encode/escape output as the last step before the target interpreter (or let the interpreter do it). Store data raw, not pre-encoded (avoids double encoding).

### V1.2 Injection prevention
- [ ] 1.2.1 (L1) Context-correct output encoding for HTTP responses, HTML/XML documents: HTML element, attribute, comment, CSS, HTTP header field.
- [ ] 1.2.2 (L1) Building URLs: encode untrusted parts for their position (URL-encode or base64url for path/query values); allow only safe protocols (reject `javascript:`, `data:`).
- [ ] 1.2.3 (L1) Building JavaScript or JSON content: encode/escape to prevent JS and JSON injection.
- [ ] 1.2.4 (L1) Database queries (SQL, HQL, NoSQL, Cypher) use parameterized queries, ORM or equivalent; also inside stored procedures. Identifiers (table/column/`ORDER BY`) cannot be parameterized: map the user choice to a fixed allowlist of names.
- [ ] 1.2.5 (L1) No OS command injection: avoid shelling out; otherwise parameterized OS calls (argument arrays, no shell) or contextual command-line encoding.
- [ ] 1.2.6 (L2) LDAP injection prevented (library encoders for DN and filter contexts). N/A if no LDAP.
- [ ] 1.2.7 (L2) XPath injection prevented via parameterized/precompiled queries. N/A if no XPath.
- [ ] 1.2.8 (L2) LaTeX processors: no `--shell-escape`, allowlist of commands. N/A if no LaTeX.
- [ ] 1.2.9 (L2) Escape regex metacharacters when user text is embedded in a regular expression.

### V1.3 Sanitization
- [ ] 1.3.1 (L1) Untrusted HTML from WYSIWYG/rich-text input is sanitized with a well-known maintained sanitizer library or framework feature.
- [ ] 1.3.2 (L1) No `eval()` or dynamic code execution (incl. expression languages such as SpEL); if unavoidable, sanitize every user-derived part.
- [ ] 1.3.3 (L2) Data entering a dangerous context is sanitized first: allow only safe characters, trim over-long input.
- [ ] 1.3.4 (L2) User-supplied SVG is validated/sanitized to a safe tag/attribute set (no scripts, no `foreignObject`).
- [ ] 1.3.5 (L2) User-supplied scriptable/template content (Markdown, CSS, XSL, BBCode...) is sanitized or disabled.
- [ ] 1.3.6 (L2) SSRF: validate untrusted data against an allowlist of protocols, domains, paths and ports before calling another service (see Practical patterns).
- [ ] 1.3.7 (L2) No templates built from untrusted input (template injection); if unavoidable, strictly validate/sanitize the part included.
- [ ] 1.3.8 (L2) JNDI queries sanitized and JNDI configured securely. N/A outside Java.
- [ ] 1.3.9 (L2) Content sanitized before sending to memcache.
- [ ] 1.3.10 (L2) Format strings that could resolve unexpectedly/maliciously are sanitized (never user-controlled format string).
- [ ] 1.3.11 (L2) User input sanitized before mail systems (SMTP/IMAP injection: strip CR/LF in header values).

### V1.4 Memory, string, unmanaged code (only if using systems languages / native code)
- [ ] 1.4.1 (L2) Memory-safe string handling, safer copy and pointer arithmetic against stack/buffer/heap overflow.
- [ ] 1.4.2 (L2) Sign, range and input checks prevent integer overflow.
- [ ] 1.4.3 (L2) Release dynamically allocated memory/resources; null out references (no use-after-free / dangling pointers).

### V1.5 Safe deserialization
- [ ] 1.5.1 (L1) XML parsers restrictively configured: external entities (XXE) and unsafe features disabled; DTDs disabled/rejected where possible.
- [ ] 1.5.2 (L2) Deserializing untrusted data uses a type allowlist or forbids client-defined types; mechanisms documented as insecure never receive untrusted input.

### V1 L3 (grouped)
- 1.2.10 (L3) CSV/formula injection on export: follow RFC 4180 sections 2.6 and 2.7; in CSV and spreadsheet exports (XLS, XLSX, ODF) prefix with a single quote any field starting with `=`, `+`, `-`, `@`, tab or NUL.
- 1.3.12 (L3) Regexes free of exponential backtracking (ReDoS); sanitize/limit untrusted input to them.
- 1.5.3 (L3) Different parsers for the same data type (JSON, XML, URL) behave consistently and use the same character encoding (avoids JSON interoperability, URL-parser differential, RFI/SSRF tricks).

### Practical patterns (OWASP Cheat Sheet Series)
Input Validation:
- Validate syntax (type/format) AND semantics (dates ordered, quantity sensible). Per field define: fixed choices = exact set membership; numbers/dates = type + min/max; strings = length + structure; objects = allowed + required fields; arrays = min/max count and validate every item.
- Allowlist, not denylist. Do not "clean" by removing suspicious characters (changes meaning, still no parameterization). Free-text may allow broad Unicode with a length limit.
- Apply request size limits and parser limits (nesting depth, number size) BEFORE buffering/parsing; a schema check after parsing cannot protect an already exhausted parser.
- Schema validation (e.g. JSON Schema): set required and additional-properties behavior explicitly; listing a property neither requires it nor rejects unknown ones. Reject the request on failure; never continue with partially validated data.
- Regex: match the whole value (`fullmatch`), bound length first, avoid backtracking-prone patterns, use a non-backtracking engine or timeout; treat a timeout as failure.
- Validate on the server (client checks are UX only); also validate data from internal APIs, queues and stored records when it crosses a trust boundary.
- Valid input is not authorization: a well-formed account id does not mean the caller may access it. Check authorization separately.
- Do not log rejected input verbatim; log metadata, escape retained untrusted values (log injection).

SQL injection / query parameterization:
- Bind values through the database API; never concatenate untrusted values before preparing. ORM query strings and stored procedures with internal dynamic SQL are injectable too.
- Dynamic structure (table, column, `ASC`/`DESC`): map user choice to application-owned literal tokens, reject unknown. Keep binding all data values even after validation.
- Manual escaping is strongly discouraged (dialect/mode dependent).
- Hardening, not a fix: least-privilege DB accounts (no DBA/admin for the app, read-only where enough, separate accounts per application/function, views for column-level limits, rarely create/delete rights).
- Review: grep every place queries are built; "outer call is prepared" is not evidence that SQL inside a procedure is safe.

XSS / DOM:
- Default to framework auto-escaping; know the escape hatches (raw/unsafe-HTML directives such as `dangerouslySetInnerHTML`, `bypassSecurityTrust*`, `unsafeHTML`, `innerHTML`) and treat each as a finding unless sanitized.
- Encode per context: HTML body = entity encoding; quoted attribute = attribute encoder (always quote values); URL parameter = percent-encode the value only (not the whole URL), then attribute-encode if placed in `href`/`src`; JS = encoder that also protects the enclosing script; CSS = never interpolate untrusted data, use CSSOM with a fixed property and an allowlisted value.
- Never place untrusted data in dangerous contexts: directly in `<script>`, HTML comments, `<style>`, tag/attribute names, event-handler attributes, `eval`/`setTimeout(string)`. Use `addEventListener` and pass data as data.
- Safe sinks: `textContent`, `createTextNode`, `insertAdjacentText`, `value`, `setAttribute` with fixed safe name, `className`. `innerHTML` only with sanitized input; do not modify content after sanitizing; keep the sanitizer patched. Recommended library: DOMPurify (client) or maintained equivalent.
- URLs in `href`/`src`: allowlist `http`/`https`; reject `javascript:`.
- JSON responses must be `Content-Type: application/json`, not `text/html`.
- Defense in depth only: CSP, Trusted Types (`require-trusted-types-for 'script'`), cookie attributes, WAF. They never replace encoding/sanitization. Do not put validation/encoding in a generic interceptor/filter as the only control.

OS command and other injection:
- Prefer library functions over shelling out. If a command is unavoidable: no shell, argument array, command validated against an allowlist, arguments validated; remember argument injection (`--option` smuggled as a value): (note) terminate options with `--` where supported and reject values starting with `-`. Escaping alone leaves argument injection open.
- LDAP: RFC 4514 (DN) and RFC 4515 (filter) escaping via library, not custom code. XPath: parameterized queries.

Deserialization:
- Prefer plain data formats (JSON) with schema validation over native object serialization. Never deserialize untrusted data with native formats that can instantiate arbitrary types (Python `pickle`, unsafe YAML loaders, Java `ObjectInputStream`, PHP `unserialize`, `jsonpickle`...). Use safe loaders (e.g. `yaml.safe_load`).
- If a native format is unavoidable: type allowlist + limits on depth, references, array length, stream bytes (filters), bound input size separately; mark sensitive fields transient/non-serializable; verify integrity (signature) before deserializing. Filtering does not make arbitrary untrusted deserialization safe.
- XML: reject DOCTYPE/DTD if possible; else disable external entities and external DTD loading, limit entity expansion; keep XInclude off; restrict external access in schema validation and stylesheet processing; if a hardening setting is unsupported, fail rather than continue partially hardened.

CSV / spreadsheet formula injection (also (note) for the import side):
- Export: ASVS 1.2.10 above (escape leading `= + - @ \t \0`).
- (note) Import: never evaluate formulas; read cell values as data, and if you re-export or render imported text later, apply the export escaping and normal output encoding.

### How to verify (note: general testing practice)
- Static search for: string concatenation into queries, shell/exec calls, `eval`, raw-HTML sinks, template compilation from variables, native deserializers, XML parser factories without hardening flags.
- Dynamic: send quote/angle-bracket/`;`/`-- `/`${...}`/`{{...}}` payloads and oversized/deeply nested bodies to every input; confirm literal handling and clean 4xx rejection.

---

## V2 Validation and Business Logic
Objective: input matches business expectations; logic flows run in order and cannot be skipped; limits and anti-automation exist; high-value flows consider abuse.

### V2.1 Documentation
- [ ] 2.1.1 (L1) Documentation defines validation rules per data item (formats such as email, phone, card number, or internal formats).
- [ ] 2.1.2 (L2) Documentation defines consistency checks across combined data items (e.g. city and postal code match).
- [ ] 2.1.3 (L2) Business-logic limits and validations documented, per user and global.

### V2.2 Input validation
- [ ] 2.2.1 (L1) Validate against allowlists of values/patterns/ranges or an expected structure with logical limits. L1: at least input used for business or security decisions; L2+: ALL input.
- [ ] 2.2.2 (L1) Enforce validation in a trusted service layer; client-side validation is usability only.
- [ ] 2.2.3 (L2) Combinations of related data items are checked as reasonable per predefined rules.
(Chapter notes: schema validation is the most effective way to cover JSON/XML APIs fully; do not use DTD validation and disable framework DTD evaluation.)

### V2.3 Business logic security
- [ ] 2.3.1 (L1) A user's multi-step flow is processed only in the expected sequential order, no skipped steps (server-side state, not UI).
- [ ] 2.3.2 (L2) Business-logic limits are implemented as documented.
- [ ] 2.3.3 (L2) Business operations run in transactions: complete success or rollback to the previous correct state.
- [ ] 2.3.4 (L2) Locking at business level for limited resources (seats, slots, stock) so they cannot be double-booked via race or logic manipulation.

### V2.4 Anti-automation
- [ ] 2.4.1 (L2) Controls against excessive calls: data exfiltration, garbage-data creation, quota exhaustion, rate-limit breaches, denial of service, overuse of costly resources.

### V2 L3 (grouped)
- 2.3.5 (L3) High-value flows (large transfers, contract approval, classified access, safety overrides) require multi-user approval.
- 2.4.2 (L3) Flows require realistic human timing (reject implausibly fast submissions).

### Practical patterns
- Put limits in code AND in the doc: max length per field, max items per array, max request body, max records per user, max requests per minute per user/IP/key. Return `429` when rate limited and `413` when the body is too large.
- Model multi-step workflows as an explicit state machine on the server; reject out-of-order transitions; bind tokens/ids to a workflow stage; every endpoint re-checks the current state (REST Security cheat sheet, "Preventing Out-of-Order API Execution"). Example: `confirm` must verify `pay` completed.
- (note) Use database transactions and unique constraints/row locks (or optimistic version checks) for check-then-act races.
- Do not rely on the frontend to enforce sequencing, limits or hidden/read-only fields.
- Test rejected ranges, missing fields, invalid nested items and oversized arrays, not only malformed syntax.

---

## V3 Web Frontend Security
Objective: protect against attacks run through the browser (XSS, CSRF, clickjacking, content sniffing, data leakage via headers/cookies). Does not apply to pure machine-to-machine services.

### V3.2 Unintended content interpretation
- [ ] 3.2.1 (L1) Browsers cannot render content in the wrong context (API response or user upload requested directly): use `Sec-Fetch-*` checks, CSP `sandbox`, or `Content-Disposition: attachment`.
- [ ] 3.2.2 (L1) Text is rendered with safe functions (`createTextNode`, `textContent`), never as HTML.

### V3.3 Cookies
- [ ] 3.3.1 (L1) Cookies have `Secure`; name uses `__Host-` prefix, else `__Secure-`.
- [ ] 3.3.2 (L2) `SameSite` set according to the cookie's purpose.
- [ ] 3.3.3 (L2) Cookie names use `__Host-` unless deliberately shared across hosts.
- [ ] 3.3.4 (L2) Cookies not meant for scripts (e.g. session token) are `HttpOnly` and the value is sent to the client only via `Set-Cookie`.

### V3.4 Browser security headers
- [ ] 3.4.1 (L1) `Strict-Transport-Security` on all responses, max-age at least 1 year; L2+: `includeSubDomains`.
- [ ] 3.4.2 (L1) CORS `Access-Control-Allow-Origin` is a fixed value, or the request `Origin` is checked against an allowlist; `*` only when the response holds nothing sensitive.
- [ ] 3.4.3 (L2) `Content-Security-Policy` on responses: at minimum global policy with `object-src 'none'` and `base-uri 'none'` plus an allowlist or nonces/hashes.
- [ ] 3.4.4 (L2) `X-Content-Type-Options: nosniff` on all responses.
- [ ] 3.4.5 (L2) A Referrer policy prevents leaking sensitive URL data to third parties (`Referrer-Policy` header or element attributes).
- [ ] 3.4.6 (L2) CSP `frame-ancestors` on every response (not embeddable by default; allow only where required). `X-Frame-Options` is obsolete: not sufficient alone.

### V3.5 Browser origin separation
- [ ] 3.5.1 (L1) If not relying on CORS preflight, requests to sensitive functionality are verified to originate from the app: anti-forgery tokens or an extra non-safelisted header (CSRF defense).
- [ ] 3.5.2 (L1) If relying on preflight, it must be impossible to call the function with a request that skips preflight (check `Origin` and `Content-Type`, or require a custom header).
- [ ] 3.5.3 (L1) Sensitive functionality uses POST/PUT/PATCH/DELETE, never safe methods (GET/HEAD/OPTIONS); alternatively strict `Sec-Fetch-*` validation.
- [ ] 3.5.4 (L2) Separate applications live on different hostnames (same-origin policy, cookie scoping).
- [ ] 3.5.5 (L2) `postMessage` messages with untrusted origin or invalid syntax are discarded.

### V3.7 Other browser considerations
- [ ] 3.7.1 (L2) Only supported, secure client technologies (no Flash, ActiveX, Silverlight, NSAPI plugins, Java applets, NaCl).
- [ ] 3.7.2 (L2) Automatic redirects to a foreign hostname/domain only when the destination is on an allowlist.

### V3 L3 (grouped)
- 3.1.1 document expected browser security features and the behavior when absent. 3.7.5 behave as documented when the browser lacks them.
- 3.2.3 avoid DOM clobbering (explicit declarations, strict type checks, no globals on `document`, namespace isolation).
- 3.3.5 cookie name + value at most 4096 bytes.
- 3.4.3 (L3 form) per-response CSP with nonces or hashes. 3.4.7 CSP violation reporting location. 3.4.8 `Cross-Origin-Opener-Policy` (`same-origin` or `same-origin-allow-popups`) on document responses.
- 3.5.6 no JSONP. 3.5.7 no authorization-gated data in script resources (XSSI). 3.5.8 authenticated resources loadable only as intended (`Sec-Fetch-*` checks or restrictive `Cross-Origin-Resource-Policy`).
- 3.6.1 externally hosted (CDN) assets only if static, versioned and protected by Subresource Integrity, else a documented decision.
- 3.7.3 notify and allow cancel when redirecting outside the app. 3.7.4 domain on the HSTS preload list.

### Practical patterns
CSRF (cookie-authenticated apps):
- Order: use the framework's built-in CSRF protection first. Stateful: synchronizer token (random, unique per session, secret, sent in a hidden field or custom header, never in a cookie for this pattern, never in URL/logs). Stateless: signed (HMAC) double-submit cookie; naive double-submit is discouraged. API/AJAX without forms: require a custom request header.
- Modern browsers: check `Sec-Fetch-Site`; reject non-safe methods when `cross-site`; allow `same-origin`; treat `same-site` carefully if sibling subdomains are untrusted. A fallback to `Origin`/`Referer` verification is mandatory for browsers without `Sec-Fetch-*`.
- Disallow "simple" content types on APIs (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`) so a JSON API cannot be hit by a cross-site form.
- No state change on GET. `SameSite` is defense in depth: Lax still sends on top-level GET navigations, is site-scoped (not origin-scoped) and defaults differ across browsers. Never set a cookie `Domain` unless required (exposes all subdomains).
- XSS defeats every CSRF defense. Add user interaction (re-auth/confirmation) for highly sensitive operations. Login forms can be CSRF targets too.
- Upload endpoints need CSRF protection as well.

CSP and headers:
- Send CSP as a header on all responses (not just the index). Start with `Content-Security-Policy-Report-Only` to find breakage, then enforce. Prefer nonce/hash-based `script-src` over host allowlists; avoid `unsafe-inline` and `unsafe-eval`; add `object-src 'none'`, `base-uri 'none'`, `frame-ancestors`, and (note) `form-action`. CSP is a second layer, never the only XSS defense.
- API responses consumed by browsers: `Cache-Control: no-store` for sensitive data, correct `Content-Type`, `X-Content-Type-Options: nosniff`, HSTS, `Content-Security-Policy: frame-ancestors 'none'` (and `default-src 'none'` if never HTML), `Referrer-Policy: no-referrer`.
- (note) `Permissions-Policy` to disable unused browser features.

Redirects and forwards (Unvalidated Redirects and Forwards):
- Never redirect to a URL taken from request input. Safe options: fixed destinations in code; map a short key/id to a server-side destination; or allowlist the host (and path), compared after parsing with the same parser used to follow it; use a framework helper that rejects non-local destinations for post-login `returnUrl` ((note) i.e. relative paths only; reject `//host`, `\`, scheme-bearing values).
- Server-side forwards driven by input must re-check that the user is authorized for the target; otherwise an attacker routes to an admin function.
- If an external redirect is required, show an interstitial warning with a cancel option (ASVS 3.7.3).

---

## V4 API and Web Service
Objective: secure configuration and hygiene for HTTP/JSON/XML/GraphQL/WebSocket interfaces. Authentication, session and validation chapters apply to APIs as well.

### V4.1 Generic web service security
- [ ] 4.1.1 (L1) Every response with a body has a `Content-Type` matching the real content, with charset where relevant (e.g. UTF-8).
- [ ] 4.1.2 (L2) Only user-facing (browser) endpoints auto-redirect HTTP to HTTPS; API/other endpoints do not (a silent redirect hides clients that send secrets over HTTP).
- [ ] 4.1.3 (L2) Headers set by an intermediary (load balancer, proxy, backend-for-frontend), e.g. `X-Real-IP`, `X-Forwarded-*`, `X-User-ID`, cannot be overridden by the end user (strip or overwrite at the edge; trust only from known proxies).

### V4.2 HTTP message structure
- [ ] 4.2.1 (L2) All components (load balancer, firewall, app server) determine message boundaries correctly for the HTTP version (request smuggling): HTTP/1.x with `Transfer-Encoding` ignores `Content-Length`; HTTP/2 and HTTP/3 `Content-Length` must equal DATA frame length.

### V4.3 GraphQL (N/A if no GraphQL)
- [ ] 4.3.1 (L2) Query allowlist, depth limit, amount limit or cost analysis against expensive nested queries.
- [ ] 4.3.2 (L2) Introspection disabled in production unless the API is meant for third parties.

### V4.4 WebSocket (N/A if no WebSocket)
- [ ] 4.4.1 (L1) WSS (TLS) for all WebSocket connections.
- [ ] 4.4.2 (L2) Handshake checks the `Origin` header against an allowed list.
- [ ] 4.4.3 (L2) If normal session management cannot be used, dedicated tokens that meet the session-management requirements.
- [ ] 4.4.4 (L2) Dedicated WebSocket tokens are obtained/validated through the already-authenticated HTTPS session.

### V4 L3 (grouped)
- 4.1.4 only explicitly supported HTTP methods allowed (incl. OPTIONS for preflight); block the rest. 4.1.5 per-message digital signatures for highly sensitive or multi-hop transactions.
- 4.2.2 generated `Content-Length` never conflicts with the framing. 4.2.3 no connection-specific headers (e.g. `Transfer-Encoding`) in HTTP/2 or HTTP/3. 4.2.4 reject HTTP/2 and HTTP/3 headers containing CR, LF or CRLF. 4.2.5 outgoing requests avoid overly long URIs/headers (e.g. long `Cookie`) that the receiver rejects.

### Practical patterns (REST Security, Mass Assignment, SSRF, Injection)
REST:
- HTTPS only. Access control at EVERY endpoint, decided locally (authenticate at an identity provider, authorize per resource and per action; check the caller owns/may access each object id to prevent IDOR).
- Restrict HTTP methods with an allowlist; answer others `405`; authorize per method and resource.
- Input: strong types, constrain strings, reject unexpected content, size limit with `413`, require a supported `Content-Type` on bodies (`415` otherwise), do not copy `Accept` into the response `Content-Type`, return `406` when nothing acceptable. Use hardened parsers (XXE-safe for XML).
- Errors: generic messages, no stack traces or internals. Audit logs for security events; sanitize logged data (log injection); log validation and token failures.
- No credentials, tokens or API keys in URLs (they land in logs and referrers); use headers or the body.
- Management/admin endpoints not exposed to the internet; if unavoidable, strong MFA, separate port/host/subnet and firewall rules.
- CORS: disable if cross-origin calls are not needed; otherwise specific origins only, never reflect any `Origin`, never `*` together with credentials.
- JWT (if used): require a signature/MAC, reject `alg: none`, choose the verification algorithm from your own configuration (not the token header), validate `iss`, `aud`, `exp` (and `nbf` where required), prefer signatures over shared-secret MACs, revoke by `jti` on logout when needed.
- API keys identify clients and cap abuse; they are not sufficient protection for sensitive resources. Return `429` when requests are too fast.
Mass assignment:
- Bind request bodies to dedicated input objects (DTOs) containing ONLY client-editable fields, or explicitly allowlist bindable fields (including nested objects). A blocklist of "dangerous" fields is fragile (new fields become bindable). Role, owner, price, status, verified flags, tenant id are server-set. DTOs do not replace authorization.
SSRF (server fetches a URL influenced by a user):
- Prefer not to accept full URLs: accept an id/key or a validated host and build the URL from fixed scheme, port and path yourself. Parse once; if two parsers can disagree on the host (`http://a.com\@evil.com`), reject.
- Known set of destinations: allowlist of hosts/IPs (compare parsed canonical values exactly), plus network-layer egress rules (firewall/segmentation) as a second layer.
- Any external destination (webhooks): resolve DNS yourself, require a public address (reject loopback `127.0.0.0/8`, `0.0.0.0/8`, `::1`, private `10/8`, `172.16/12`, `192.168/16`, link-local incl. cloud metadata endpoint `169.254.169.254` ((note) whole `169.254.0.0/16`), `fe80::/10`, unique-local `fc00::/7`, multicast), and connect ONLY to the validated IP (keep Host header/SNI/cert check on the original name) to defeat DNS rebinding; apply the same policy to retries and fallbacks.
- Disable following redirects in the HTTP client (or revalidate each hop). Allow only `http`/`https` schemes (no `file:`, `gopher:`, `ftp:`...). (note) Set connect/read timeouts and response size limits; do not return raw upstream responses/errors to the user.
- Cloud metadata services are a prime SSRF target: use the hardened metadata mode (e.g. token-based IMDSv2 on AWS) and (note) keep workload credentials least-privileged.

### How to verify (note: general testing practice)
- Check headers on real responses with curl (`Content-Type`, `nosniff`, HSTS, CSP, `Set-Cookie` flags).
- Call every endpoint with: wrong method, wrong/missing `Content-Type`, extra JSON fields (`role`, `isAdmin`), another user's object id, oversized body, and out-of-order workflow step; expect `4xx` with generic body.
- Point every URL-taking feature at `http://127.0.0.1`, the metadata address, a redirecting URL and a DNS name that resolves to a private IP; expect rejection.

---

## V5 File Handling
Objective: files must not cause denial of service, unauthorized access or storage exhaustion, nor become executable or hostile content.

### V5.1 Documentation
- [ ] 5.1.1 (L2) For each upload feature document: permitted file types, expected extensions, maximum size (including unpacked size), and how files are made safe to download/process and what happens when a malicious file is detected.

### V5.2 Upload and content
- [ ] 5.2.1 (L1) Accept only file sizes the app can process without performance loss or DoS (enforce at the edge/body parser before buffering).
- [ ] 5.2.2 (L1) Check extension against the expected list AND that the content matches the type (magic bytes, image re-encoding, specialized validation libraries); applies to files inside archives too. L1: at least files used for business or security decisions; L2+: every accepted file.
- [ ] 5.2.3 (L2) Compressed files (zip, gz, docx, odt...) are checked BEFORE extraction against max uncompressed size and max number of files.

### V5.3 Storage
- [ ] 5.3.1 (L1) Uploaded/generated files in a public folder are never executed as server-side code when requested directly.
- [ ] 5.3.2 (L1) File paths are built from internally generated/trusted data, not user filenames; if user filenames/metadata are needed, strictly validate and sanitize (path traversal, LFI/RFI, SSRF).

### V5.4 Download
- [ ] 5.4.1 (L2) User-submitted filenames (also in JSON, JSONP, URL parameters) are validated or ignored, and the response sets `Content-Disposition` with a filename.
- [ ] 5.4.2 (L2) Served file names (HTTP headers, email attachments) are encoded/sanitized (e.g. RFC 6266) to avoid injection.
- [ ] 5.4.3 (L2) Files from untrusted sources are scanned by antivirus before being served.

### V5 L3 (grouped)
- 5.2.4 per-user file-size quota and maximum file count. 5.2.5 reject archives containing symlinks unless required (then allowlist link targets). 5.2.6 reject images above a maximum pixel size (pixel flood). 5.3.3 server-side processing such as decompression ignores user-supplied path info (zip slip).

### Practical patterns (File Upload cheat sheet)
Upload pipeline, in this order:
1. Authenticate and authorize the uploader; CSRF-protect the endpoint.
2. Enforce request size limit and per-user quota before reading the body.
3. Decode the filename, then validate: allowlist of business-needed extensions only; length limit; restricted characters; reject double extensions, null bytes, case tricks, alternative interpreter extensions, colon (`:`, NTFS alternate data streams), leading dot/hyphen/space and sequential dots. An extension denylist is weak on its own.
4. Do not trust the `Content-Type` header (spoofable; quick check only). Validate the file signature in addition (not alone).
5. Content validation: images decoded and re-encoded to an allowed format with metadata stripped (the image processor is itself an attack surface: use updated library, restricted formats, resource limits, sandbox); documents through a parser/CDR; ZIPs are discouraged.
6. Generate the stored name yourself (UUID); keep the original name only as metadata, validated. Serve via an application handler mapping `id -> file`.
7. Store on a different host/storage service or outside the web root; no execute permission; least-privilege filesystem permissions; disable per-directory config overrides (`.htaccess`, `web.config`) in upload dirs.
8. Scan with antivirus/sandbox; consider manual review in a sandbox for public files; offer an abuse-report path for publicly retrievable files.
9. Download: apply request limits on downloads; (note) set `Content-Type` explicitly, `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment` for user content (or serve from a separate, cookieless origin) (ASVS 3.2.1, 5.4.1).
Files stored in a database add SQLi/size/backup concerns: only with a justified reason.
Files emailed or processed without being stored need the same checks before any action.

### Safe handling of untrusted document and spreadsheet imports ((note): general knowledge unless it cites an ASVS id)
- [ ] (note) Enforce an upload size cap and an unpacked-size cap (5.1.1, 5.2.1, 5.2.3) before parsing; reject on exceed rather than truncating.
- [ ] (note) Type check = extension allowlist + magic bytes + successful parse by the real parser (5.2.2). Reject macro-enabled formats (e.g. `.xlsm`, `.docm`, `.xlsb`), legacy binary Office formats and anything with embedded executable objects unless required. Prefer plain CSV/TSV or `.xlsx` read by a library that never executes macros.
- [ ] (note) Treat OOXML/ODF as zip archives: check the entry count, total and per-entry uncompressed size and compression ratio BEFORE inflating (zip bomb, 5.2.3); ignore entry paths, never extract to disk by entry name (zip slip, 5.3.3); reject symlinks (5.2.5); limit nesting of archives-in-archives.
- [ ] (note) Parse with a library in "data only" mode: read cached cell values, never evaluate formulas; do not resolve external links/data connections/remote workbook references; disable DTD and external entities in the underlying XML parser (1.5.1); no network access during parsing.
- [ ] (note) Bound the work: max rows, columns, sheets, cell length, total cells and parse time; stream large files; run in a worker with a timeout and memory limit; ideally in a sandboxed or low-privilege process (no network, read-only filesystem except a temp dir) because parser libraries have memory-safety and XML bugs.
- [ ] (note) Validate every cell as untrusted input per column rules (types, ranges, length, enum membership); reject or report row-level errors; import transactionally (all-or-nothing or explicit partial-import report) and preview before commit.
- [ ] (note) Strings from the file go through parameterized queries and output encoding like any input. Values beginning with `= + - @` stay inert as stored data; escape them again on any later CSV/spreadsheet export (1.2.10).
- [ ] (note) Strip or ignore metadata (author, hidden sheets, comments) unless needed; do not echo raw parser errors to the user (path or library leakage); log the file hash, size and outcome, not its content.
- [ ] (note) Never open the file with the desktop application or a converter that follows links or runs macros on the server; if conversion is needed (e.g. to PDF), run it sandboxed without network.

### How to verify (note: general testing practice)
- Upload: a renamed executable, `a.jpg.php`, `a.php%00.jpg`, `a.asp:.jpg`, a file with a spoofed `Content-Type`, an oversized file, a 1 MB zip that inflates to GB, a zip with `../` entries and symlinks, an image with huge pixel dimensions; expect clean rejection and no stored file.
- Import: a spreadsheet with `=HYPERLINK(...)`/`=cmd|...` cells, external links, XML entity expansion, 1M rows; expect inert data, rejection or a bounded failure.

---

Sources: OWASP ASVS 5.0.0 (May 2025; `ASVS/5.0/en/0x10-`0x14`, V1-V5; git checkout commit `9ccce0e3cf47abd6a412fc8a8deadd7fd6da501f`, 2026-10-26; the `5.0` directory tracks the 5.0.x line, no newer ASVS major seen); licence CC BY-SA 4.0; https://github.com/OWASP/ASVS, https://owasp.org/www-project-application-security-verification-standard/. OWASP Cheat Sheet Series (commit `1abd8667e9311f7ae54eb9be8fc1e28cc6a15de9`, 2026-11-01), licence CC BY-SA 4.0, https://cheatsheetseries.owasp.org/: Input Validation, SQL Injection Prevention, Injection Prevention, OS Command Injection Defense, Cross Site Scripting Prevention, Content Security Policy, Cross-Site Request Forgery Prevention, REST Security, Mass Assignment, Deserialization, XML External Entity Prevention, Server-Side Request Forgery Prevention, Unvalidated Redirects and Forwards, File Upload. Not in the cheat sheets: CSV injection (taken from ASVS 1.2.10 only) and all `(note)` lines. Rewritten and condensed; attribution to OWASP retained; derived text stays under CC BY-SA 4.0.
