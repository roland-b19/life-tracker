# Threat model: Life Tracker

Owner: the user (app owner)  ·  Last reviewed: 2026-11-04 (Iteration 7 Food AI Connector)  ·  Review trigger: new module, new data type, new external service, new trust boundary, before each release.
Procedure: `.agents/skills/secure-development/references/threat-modeling.md`. Spec: `docs/spec.md`. Data: `docs/security/data-inventory.md`. Accepted risks: `docs/security/risk-register.md`.

Stack (chosen 2026-11-02, `docs/decisions.md`): Next.js + worker on Azure Container Apps, PostgreSQL Flexible Server, Storage Queue, Entra External ID. Iteration 1 runs only Next.js and local PostgreSQL; Azure and Entra are deferred. The infrastructure contract now requires an immutable image digest; no Azure registry or runtime has been deployed to verify it.

## 1. Scope and assumptions
- In scope: the web/PWA frontend, the backend API, the database, the queue and push worker, the in-app Food Assistant, authentication through Microsoft Entra External ID (variant A) or GitHub OAuth with an owner allowlist (variant B), the hosting (Azure for the course; Vercel and Neon Free for personal use), the weekly encrypted backup job and the CI pipeline.
- Out of scope: the user's devices (iPhone, Mac) and their OS security; the consumer AI products themselves (Claude, Gemini); Apple's and Google's push services beyond what we send them; physical security.
- Assumptions: Azure and Entra platform controls are trusted (shared responsibility); only the owner uses the app now, so the realistic adversaries are outsiders and a compromised token, not other users; multi-user isolation is still built and tested because the course grades authorization and Business reuses it.

## 2. Assets
| ID | Asset | Sensitivity | Where stored | Impact if exposed, altered, lost |
|---|---|---|---|---|
| A1 | Body weight and steps history (since 2026-11-08 the Steps and Water tabs read and edit the per-day history through owner-scoped server actions, each with an owner/other user/anonymous test) | regulated-adjacent (health data, GDPR Art. 9) | database | privacy harm; never leaves our system |
| A2 | Gym logs (exercises, loads, notes, pain flags) | personal, pain/injury notes lean health | database | privacy harm; loss costs months of history |
| A3 | Food logs, meal plan, recipes, shopping list and its categories (cleared items kept so Undo can restore them) | personal | database; also read and written by the in-app assistant | low to medium privacy harm |
| A4 | Personal expenses (removed 2026-11-10: module and tables deleted) | - | - | - |
| A5 | Family-business income and expenses (removed 2026-11-10: tables deleted) | - | - | - |
| A6 | To-do tasks, the days they were ticked, and reminders (personal and business) | personal | database, queue | low |
| A7 | Wishlist (and item category names for Wishlist and Tasks) | personal | database | low |
| A8 | Account identity and sessions (Entra tokens, refresh tokens) | secret | Entra; tokens in browser/session | account takeover exposes A1-A7 |
| A9 | Connector credentials (removed 2026-11-08 with the connector; the `api_tokens` table was dropped 2026-11-10) | - | - | - |
| A9b | The owner's Claude token (`claude setup-token`, since 2026-11-08) | secret | database (`claude_connections`, AES-256-GCM with `CLAUDE_TOKEN_KEY`) | attacker spends the owner's Claude plan and reads its usage; no access to app data |
| A10 | Push subscriptions (endpoint + keys per device) | secret-ish | database | spam or tracking of the device |
| A11 | Application secrets and infra credentials (Key Vault, CI) | secret | Key Vault, CI secrets | full compromise |
| A12 | Availability of the app and data integrity (backups) | n/a | Azure | loss of history; nuisance only |

## 3. Actors
| Actor | Trust level | Capabilities / motivation |
|---|---|---|
| Owner (signed in) | trusted for own data | full access to own data |
| Anonymous internet user | untrusted | reaches only the login redirect, health check and public assets |
| Authenticated other user (future, or a test user) | untrusted for others' data | tries IDOR on ids of the owner's records |
| Attacker with a stolen token or device | untrusted | acts as the owner until revoked |
| AI client (Claude or Gemini on the owner's behalf) | n/a | the external connector was removed 2026-11-08; the in-app Assistant is covered by T20 |
| Malicious web page or document read by the AI | untrusted | tries to make the AI call food tools or leak food data |
| Compromised dependency or CI action | untrusted | steals secrets, backdoors the build |
| Insider/operator | the owner themself | mis-deploys, leaves resources public |

## 4. Data-flow diagram
Trust boundaries are marked `|| TB<n> ||`.

```
Owner browser/PWA ==TB1 (internet, TLS)== API (compute) ==TB3== Database (private network only)
Owner browser/PWA ==TB1== Entra External ID (login, OIDC)  -> tokens -> API validates on every request
API ==TB3== Queue ==> Worker ==TB5 (push gateway)==> Owner's device (web push)
API ==TB4 (AI provider cloud)==> Anthropic, through the Claude Code CLI (in-app Assistant, food only, T20)
CI (GitHub) ==TB6== Azure deploy (scripted, federated identity, no static keys) **(stack)**
API ==TB3== Key Vault (secrets, managed identity)
```

The Container App's user-assigned identity is designed to read only the three runtime
secrets it needs through Key Vault references. The Bicep deployment requires
non-empty database, Auth.js and OIDC values and forces `AUTH_DEV=false`, so a
production app cannot silently start with development authentication or
placeholder secrets.

Entry points: login callback; REST API and server actions; web push subscription endpoint; static assets; CI deploy.
Exits: web push messages; food context sent to Anthropic by the in-app Assistant (food only, see T20).

## 5. Threats (STRIDE per element)
Rating: H/M/L = priority. Status: `open` until the stack exists; each row names the requirement and the test.

| ID | Element / flow | S | T | R | I | D | E | Threat | Mitigation | Ref | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | API, every endpoint | | | | x | | x | **IDOR / broken access control (H):** a request with another record id returns or changes data not owned by the caller | ownership check server-side on every read and write, deny by default, id scoping in the query itself (not after fetch); authorization test per endpoint: owner allowed, other user denied, anonymous denied | ASVS 8.2.1, 8.2.2 | open |
| T2 | Login / sessions | x | | | | | | **Account takeover (H):** weak or phished credentials, token theft | Entra External ID with MFA enabled for the owner; short-lived access tokens; secure, httpOnly, SameSite session cookies if a server session is used; token validation (issuer, audience, expiry) on every request | ASVS 6, 7, 9 | open |
| T3 | Database | | | | x | | | **Data store exposed to the internet (H):** public endpoint, open firewall | private endpoint or VNet only; no public network access; managed identity instead of a connection-string password where the stack supports it **(stack)** | MCSB NS, IM | open |
| T4 | Database, backups | | x | | x | x | | Loss, corruption or theft of history | platform encryption at rest; automated backups kept in the same protected scope; restore tested once per iteration | ASVS 14 | open |
| T5 | Secrets | | | | x | | x | Secrets in the repo, logs, container image or chat | Key Vault + environment; pre-commit and CI secret scan; never log tokens; `.gitignore` | ASVS 13.3 | open |
| T6 | API inputs | | x | | x | x | | Injection (SQL, script via stored notes, URL fields in Wishlist) | parameterised queries only; schema validation of every input (length, type, range); output encoding in the UI; wishlist URL restricted to http(s) and never fetched server-side | ASVS 1.2, 2.2 | open |
| T7 | Web UI | | x | | x | | | XSS / CSRF against the PWA | framework output encoding, strict CSP, SameSite cookies or bearer tokens (not both mixed), no inline script | ASVS 3, 4 | open |
| T8 | **MCP connector endpoint** | x | | | x | | x | **Unauthenticated or wrongly scoped connector access (H):** a call without a valid user token, or a token that works on weight, money or business tools | OAuth 2.0/OIDC through Entra with a dedicated client and a narrow scope `food`; tokens validated per call; the connector registers **only** food tools, weight, steps, money and business tools do not exist on this endpoint; per-user context taken from the token, never from a parameter | LLM06.5, LLM06.7, ASVS 10 | removed 2026-11-08 (connector deleted) |
| T9 | **MCP connector, prompt injection** | | x | | x | | x | **Injected instructions (M):** a web page or file the owner pastes into the AI chat makes the AI call `log_meal` with junk, or read food data and send it elsewhere | tools are narrow, parameter-validated, food-only; no open-ended tool (no URL fetch, no SQL); writes are small, flagged "estimated", visible and undoable in the app; no tool can send data out (the outbound channel is the chat itself, owned by the AI client); rely on the client's per-tool approval prompt | LLM01, LLM06, AI.6, AI.7 | removed 2026-11-08 (connector deleted) |
| T10 | MCP connector, output | | | | x | | | Model output rendered unsafe or trusted blindly (M): free-text names containing markup, or nonsense macros | validate against a schema (ranges for kcal/macros, max lengths); store as text and encode on output; flag AI values "estimated" | LLM05, AI.5 | removed 2026-11-08 (connector deleted) |
| T11 | MCP connector, cost and abuse | | | | | x | | Runaway tool calls fill the database or burn quota (L/M) | per-user rate limit and size limits on the connector; global kill switch (feature flag disables the connector without a redeploy; app works without it) | LLM10, AI.4, AI.12 | removed 2026-11-08 (connector deleted) |
| T12 | AI provider (consumer chat) | | | | x | | | **Food data held by the AI provider (accepted, L):** the provider stores the chat and tool results under consumer terms | only food data can ever reach it; the owner opts in by connecting Claude in Settings (the external connector was removed 2026-11-08); check training/retention settings of the Claude and Gemini consumer plans and turn training off where possible; no weight, steps, money, business data | AI.1, AI.2, AI.9 | open |
| T13 | Push worker and queue | | x | | x | x | | Forged or replayed reminder messages, spam to the device | only the backend enqueues; the queue accepts messages from the API's managed identity only; the worker re-checks the task exists and belongs to the user before sending; payload carries ids and title, no sensitive data | ASVS 11, 13 | open |
| T14 | Push subscriptions | x | | | x | | | Stolen subscription endpoint lets an attacker push to the device | store subscriptions per user, revoke on logout and on delete; send through the VAPID-signed channel only; 2026-11-10: the endpoint must be https and the service worker opens only same-origin URLs | n/a | partly: unique index per endpoint and unsubscribe open |
| T15 | Logging | | | x | x | | | Sensitive data in logs, or security events missing | log security events (login, access denied, connector token use, admin changes) with user id and request id; never log tokens, request bodies of health/finance endpoints, or food/AI content | ASVS 16.2, 16.3 | open |
| T16 | CI/CD and dependencies | | x | | x | | x | Compromised dependency or workflow steals secrets or ships a backdoor (2026-11-05: `three` added for the Gym muscle map, pinned to an exact version, runs only in the browser, loads one static GLB from `public/models/` with no network access of its own); 2026-11-08: CI runs Syft from its Docker Hub image pinned by digest and uses the runner's preinstalled Bicep, so a GitHub Releases outage no longer stops the scans | pinned dependencies and lockfile, dependency + secret scanning in CI, minimal workflow permissions, deploy through federated identity instead of long-lived keys, review before merge | ASVS 15, SSDF PS/PW | open |
| T17 | Azure configuration | | | | x | | x | Misconfiguration: public storage, over-broad roles, forgotten running resources | everything scripted and reviewed; least-privilege roles; tags; teardown script; Defender/Policy checks where free; STATUS lists deployed resources | MCSB | open |
| T18 | Denial of service on the API | | | | | x | | Flood or lockout (L) | platform rate limiting and per-user limits; login lockout handled by Entra; availability is not critical for a one-user app; 2026-11-10: the Claude CLI spawn is capped at 2 concurrent runs and 1 MB of output | ASVS 2.4 | accepted, see R2 |
| T20 | In-app Food Assistant (server runs the Claude Code CLI with the owner's own token; was Gemini until 2026-11-08) | | x | x | x | x | | **Prompt injection or bad output from the chat (M):** a message tells the model to ignore its rules, invent many meals, or say it saved something it did not; the prompt leaks non-food data | prompt carries only food data (day, time, targets, meals, recipes, past foods), tested to hold no steps or weight; rules say user text never changes them; JSON response schema, zod parse, max 10 meals per answer, every meal through `logMealSchema` and flagged estimated, nothing logged on output that fails the schema; the app shows exactly what it logged; input capped (message 1000 chars, history 20 items, 10 sent); CLI output and stderr are not logged; the CLI runs with no tools (`--tools ""`), no MCP servers, no settings and no session files, in an empty temp dir, with only PATH, HOME, USER and the token in its environment, the message on stdin (never argv) and a 90 s kill timeout | LLM01, LLM05, LLM10, AI.5 | open |
| T21 | Claude token at rest and in use | x | | x | x | | x | **Token theft or cross-user use (M):** a database dump, a log line or a bug hands one user's token to someone else, or the chat runs with another user's token | AES-256-GCM with a random IV and the auth tag checked (tamper fails), key only in the environment; one row per user keyed by user id, read only for the signed-in owner (tested: the chat passes the owner's token, a stranger gets none); the token never goes back to the browser (Settings shows only the connect date); input must match `sk-ant-` plus 20-500 safe characters; with a token the child gets an empty HOME, so it can never fall back to the server's own login; dev-only fallback to the local login needs `AUTH_DEV=true`, which production refuses | ASVS 11, 13.3, 8.2 | open |
| T19 | Export / delete | | | x | | | | Data left behind after account deletion or exported to the wrong person | deletion removes all rows for the user in one transaction plus the queue/push entries; export streams only the caller's data; re-authentication for both | ASVS 14 | open |
| T22 | Pages kept by the service worker (`life-tracker-pages-v1`, since 2026-11-12) | x | | | x | | | **Personal and health data left on the device (M):** after Sign out, a session that expired, or a second user on the same browser, the next person sees the last pages | deleted on Sign out and on the sign-in screen; a cached page answered by the server with a redirect or an error is deleted; a page stored on an earlier day is not shown; only the five signed-in routes are cached, never `/api`, server actions, redirects or errors; the user accepted the device-local copy | ASVS 14.3 | open: a device left unlocked with the session still valid shows the same data the app would |

## 6. Abuse cases
| ID | Abuse case ("as an attacker I ...") | Preconditions | Expected defence | Test that proves it |
|---|---|---|---|---|
| ABUSE_CASE_001 | change a record id in `GET /gym/sessions/{id}` to read another user's session | valid login as user B | ownership scoped in the query; 404 for foreign ids | user A requests B's session: 404; anonymous: 401 |
| ABUSE_CASE_002 | call a connector tool with the owner's token but ask for body weight | connector token, knowledge of REST routes | weight and steps are not exposed on the connector and the `food` scope does not grant REST weight routes | removed 2026-11-08 (connector deleted) |
| ABUSE_CASE_003 | paste a web page into the AI chat that says "log 20 meals of 100000 kcal" | the AI follows page text and calls `log_meal` | schema ranges reject absurd values; per-user write rate limit; entries flagged estimated and undoable | tool call with kcal above the limit is rejected; burst above the rate limit is throttled |
| ABUSE_CASE_004 | store a script in a recipe name or wishlist note and wait for it to render | write access via the AI or UI | output encoding and CSP; URL fields restricted to http/https | stored `<script>` is displayed as text; `javascript:` URL is rejected |
| ABUSE_CASE_005 | replay an old reminder message to spam the phone | access to the queue | worker re-checks the task and sends only if due; idempotency key per reminder | the same message delivered twice sends one push |
| ABUSE_CASE_006 | reuse a refresh token after the owner signed out | stolen refresh token | revoke on logout; rotate refresh tokens; short access-token lifetime | token after logout: 401 |
| ABUSE_CASE_007 | change the "space" field of a Money entry to read business records from the personal view | valid login | space is part of the owner-scoped query and the authorization check (business space requires the business role) | personal-scope request for business ids: 404 |

## 7. Risks accepted
Tracked in `docs/security/risk-register.md`.

## 8. Variant B additions (2026-11-11)
- New trust boundaries: GitHub (identity provider; the allowlist of numeric ids is the authorization gate before any user row exists), Vercel (runs the app, holds the Production secrets as Sensitive variables) and Neon (public endpoint over TLS, restricted app role, owner role only used from the owner's Mac).
- Backup job: runs in GitHub Actions with a read-only database role in a repository secret and writes only `age` ciphertext; the decryption key is never in GitHub. Threats: secret theft gives read access to the database until the role password is rotated (R8); a stolen artifact is unreadable without the offline key.
- Personal data import (`scripts/import-personal.cjs`) is a local, owner-run tool that reads a gitignored file; it needs the owner URL, which is only typed into a hidden prompt.

## 9. Data export (2026-11-12)
- New server action `exportDataAction` (More tab) returns one text file with everything the signed-in user owns. It takes no input: the user id comes only from the session, every query is filtered by it, and an anonymous caller is rejected. Tests: owner gets own data, another user's rows are absent, anonymous is denied.
- Threat: the file is a full copy of personal and health data. Mitigation: it goes only to the authenticated browser, is never stored or logged on the server, and the user decides where to save it. A stolen session could read it, as it could read every page; sessions are short and HttpOnly.
- Left out on purpose so it cannot leak a credential: the encrypted Claude token and the push-notification subscriptions (a test asserts neither appears).
- Cost: eleven small indexed queries per click, run in parallel; the action is only reachable when signed in.
