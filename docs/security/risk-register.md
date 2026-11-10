# Risk register: Life Tracker

Reviewed 2026-11-11 (R6 to R8 added for variant B). Ids refer to `docs/threat-model.md`.

| ID | Risk | Asset | Likelihood | Impact | Response | Control / requirement | Status | Reason and owner | Review date |
|---|---|---|---|---|---|---|---|---|---|
| R1 | AI provider retains and may train on food content typed in the chat (T12) | A3 | M | L | accept | only food data reachable; consumer-plan training setting turned off where available; owner opts in | accepted | The owner wants chat-based logging without an API; food data is low sensitivity. Owner: the user | 2027-02-01 or when the provider changes terms |
| R2 | DoS by volumetric traffic or login flooding (T18) | A12 | L | L | accept | platform defaults and per-user limits only | accepted | One-user app, no availability requirement. Owner: the user | 2027-02-01 |
| R3 | Estimated macros from the AI are wrong | A3 | H | L | accept | values flagged "estimated", editable; no medical decisions from them | accepted | Chosen by the user ("strictly AI for macros"). Owner: the user | when real use shows a problem |
| R4 | Field-level encryption of weight and finance is not implemented in the course phase | A1, A4, A5 | L | M | accept | platform encryption at rest, private network, owner-only access; schema leaves room for field encryption | accepted | `docs/security-plan.md` decision 3; revisit after the stack is chosen. Owner: the user | at stack decision |
| R5 | Gemini connector not confirmed on Google AI Plus; falling back to Claude only | n/a | M | L | accept | none needed | open | Feature gap, not a security risk; verify in Gemini settings. Owner: the user | when the connector is built |
| R6 | The personal database (Neon Free) is reachable from the public internet (no private networking on the Free plan) | A1 to A7 | L | H | accept | TLS only, unguessable owner password, restricted app role without DDL, the app is the only client, GitHub sign-in with 2FA and an owner allowlist, no data in preview deployments | accepted | Variant B has no private endpoint option on Free; the Azure variant has one. Owner: the user | at the Azure deploy or when Neon changes plans |
| R7 | Neon or Vercel changes or ends the Free plan, or suspends the project | A12 | M | M | mitigate | weekly encrypted backup (`backup.yml`), tested restore, `Dockerfile` runs on any host | open | Needs one successful restore test. Owner: the user | quarterly |
| R8 | A backup artifact leaks (GitHub account takeover) | A1 to A7 | L | H | mitigate | dump is encrypted with `age` before upload; the private key is offline; the backup role is read-only; 2FA on GitHub | accepted | Loss of the private key makes every backup unreadable: keep a second offline copy. Owner: the user | quarterly |
