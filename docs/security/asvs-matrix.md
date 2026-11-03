# ASVS verification matrix: Life Tracker iteration 2A

Target level: 2 (L3 auth/authorization where cheap)  ·  ASVS version: 5.0.0  ·  Last pass: 2026-11-03

| Requirement | Chapter | Status | Evidence |
|---|---|---|---|
| V2.2.1 / V2.2.2 | Validation | met | Strict Zod schema in `app/api/weight/route.ts`; authorization tests reject unknown fields and invalid ranges |
| V3.3.1 / V3.3.2 / V3.3.4 | Cookies | met | `src/auth.ts` configures `__Host-`, HttpOnly, Secure in production, and SameSite=Lax |
| V3.4.1-3.4.6 | Browser security | met | `next.config.ts` security headers; header test |
| V3.5.1-3.5.3 | CSRF / origin | met | State-changing weight routes require JSON and same-origin Origin |
| V8.2.1-8.3.1 | Authorization | met | `src/server/weight.ts` scopes every query by user id; `tests/authorization.test.ts` covers owner, other user, anonymous |
| V6.8.1 / V10.3.3 | Identity | met locally | Production OIDC is environment-driven and local users are keyed by issuer plus subject in `src/db/schema.ts`; Azure issuer/audience verification remains phase 2B evidence |
| V7.1.1 | Session lifetime | met | JWT session max age is 4 hours; session refresh window is 15 minutes |
| V14.3.1 | Sensitive data | met locally | Weight is never logged or sent to external providers; Azure private storage and log retention remain phase 2B evidence |
| V16.5.1 / V16.5.3 | Errors | met | API returns generic errors and fails closed on missing sessions |
| V15.1.2 / V15.2.3 | Dependencies | met locally | CI generates and archives an SPDX SBOM for the built production image; moderate development-only npm findings remain deferred because available fixes require rejected major compatibility changes |
| V15.2.1 / A03 | Container supply chain | met locally | CI scans the built image for HIGH and CRITICAL OS/library vulnerabilities with Trivy; local offline scans are not evidence of a complete advisory database |
| V13.1.1 | Release integrity | met locally | Production image contract requires `sha256:<64 lowercase hex characters>`; Azure runtime pull and registry digest evidence remain unverified until deployment |

The Trivy and SBOM actions run in GitHub CI, where their advisory database and
container tooling can be downloaded. They are not treated as locally verified
controls when the machine is offline; a failed or unavailable scanner is not
silently bypassed.
| V13.2.1 / V13.3.1 | Configuration and secrets | met locally | Required runtime values are deployment parameters, stored as Key Vault secrets, and referenced by Container Apps with a user-assigned identity; deployment and runtime evidence remains phase 2B |
