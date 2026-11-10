# ASVS verification matrix: Life Tracker

Target level: 2 (L3 auth/authorization where cheap)  ·  ASVS version: 5.0.0  ·  Last pass: 2026-11-10 (3c final audit)

Status words: **met** (code and a test or CI check), **met locally** (code and tests here, runtime evidence waits for a deploy), **accepted** (a known gap with a recorded reason), **open** (not done, owner decision needed).

| Requirement | Chapter | Status | Evidence |
|---|---|---|---|
| V2.2.1 / V2.2.2 | Validation | met | Every server action and API route parses its input with Zod (`src/lib/validations/*`); shared `isoDate` and `uuid` validators in `src/lib/validations/common.ts` reject impossible dates and malformed ids; per-module tests cover rejects |
| V3.3.1 / V3.3.2 / V3.3.4 | Cookies | met | `src/auth.ts` configures `__Host-`, HttpOnly, Secure in production, SameSite=Lax |
| V3.4.1-3.4.6 | Browser security | met, with one gap | `next.config.ts` sets HSTS, CSP (`object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), nosniff, referrer and permissions policies; header test. Gap: `script-src` still has `'unsafe-inline'` (Next inline bootstrap scripts); a nonce-based CSP is **open** (decision pending) |
| V3.5.1-3.5.3 | CSRF / origin | met | Server actions use Next's built-in origin check; state-changing weight routes require JSON and same-origin Origin (`tests/same-origin.test.ts`) |
| V6.8.1 / V10.3.3 | Identity | met locally | Azure: OIDC with issuer and audience from env, users keyed by issuer plus subject. Free variant: GitHub numeric id must be in `OWNER_ALLOWLIST`, rechecked on every session read (`tests/auth-github.test.ts`). Azure tenant "assignment required" or an allowlist is **open** (decision pending), so any account of the tenant could sign in |
| V7.1.1 | Session lifetime | met | Azure: JWT 4 hours, refresh window 15 minutes. Free variant: 30 days, one personal user, allowlist rechecked per read (decision 2026-11-10) |
| V8.2.1-8.3.1 | Authorization | met | Every query is scoped by `user_id`; gym session and set writes verify that the referenced session and exercise belong to the user; `tests/authorization.test.ts` and the per-module tests cover owner, other user and anonymous; `tests/actions-anonymous.test.ts` calls every exported server action without a session and requires a rejection; `tests/pages-auth.test.ts` requires every page to check the session |
| V11.x / V12.x | Cryptography, transport | met locally | Claude tokens are AES-256-GCM encrypted at rest with `CLAUDE_TOKEN_KEY` (`tests/claude-connection.test.ts`); TLS and HSTS at the host |
| V13.1.1 | Release integrity | met locally | Production image contract requires `sha256:<64 hex>`; runtime pull evidence waits for a deploy |
| V13.1.2 | Resource governance | met locally | Budget alert in Bicep; free variant limits tracked in `docs/release-plan.md`; Claude CLI runs capped at 2 at once and 1 MB output (`tests/claude-cli.test.ts`); query-count budgets per page and for the Tasks day switch (`tests/query-count.test.ts`) |
| V13.2.1 / V13.3.1 | Configuration and secrets | met locally | Required runtime values are deployment parameters, stored as Key Vault secrets and referenced with a user-assigned identity; Vercel uses environment variables; no secrets in the repository (gitleaks in CI) |
| V14.3.1 | Sensitive data | met locally | Weight, food and gym data are never logged and are not sent to an AI provider; the Assistant sends a short food-only prompt |
| V15.1.2 / V15.2.3 | Dependencies | met locally | CI generates and archives an SPDX SBOM; `npm audit --audit-level=high --omit=optional` has no high or critical findings (11 moderate, development tooling only; fixes need major upgrades) |
| V15.2.1 / A03 | Container supply chain | met locally | CI scans the built image with Trivy for HIGH and CRITICAL; the image runs as non-root user `nextjs`; local scans are not evidence of a complete advisory database |
| V16.2.1 / V16.3.1 | Logging and diagnostics | met locally | Log Analytics diagnostic settings are declared in Bicep for PostgreSQL, Key Vault, ACR and Container Apps; runtime log verification waits for a deploy |
| V16.5.1 / V16.5.3 | Errors | met | API returns generic errors and fails closed on missing sessions; `error.tsx`, `global-error.tsx` and `not-found.tsx` show no internals |
| Push (V13.4 / V4.x) | Web Push endpoint | met locally | The push subscription endpoint must be `https` (`src/lib/validations/todos.ts`); the service worker opens only same-origin notification URLs (`public/sw.js`); the feature is behind `NEXT_PUBLIC_PUSH_ENABLED`. A unique index per endpoint and an unsubscribe action are **open** |
| LLM (OWASP LLM) | Claude Assistant | met locally | The CLI runs with the user's own token, a short system prompt, a concurrency cap and an output cap; it only logs meals (`tests/food-chat.test.ts`). The system prompt is passed on the command line (visible to other local processes); a stdin or file hand-off is **open** until checked against the real CLI |

The Trivy, SBOM and gitleaks actions run in GitHub CI, where their advisory
databases and container tooling can be downloaded. They are not treated as
locally verified controls when the machine is offline; a failed or unavailable
scanner is not silently bypassed.
