# Risk register: Life Tracker

Reviewed 2026-11-02 (v1). Ids refer to `docs/threat-model.md`.

| ID | Risk | Asset | Likelihood | Impact | Response | Control / requirement | Status | Reason and owner | Review date |
|---|---|---|---|---|---|---|---|---|---|
| R1 | AI provider retains and may train on food content typed in the chat (T12) | A3 | M | L | accept | only food data reachable; consumer-plan training setting turned off where available; owner opts in | accepted | The owner wants chat-based logging without an API; food data is low sensitivity. Owner: the user | 2027-02-01 or when the provider changes terms |
| R2 | DoS by volumetric traffic or login flooding (T18) | A12 | L | L | accept | platform defaults and per-user limits only | accepted | One-user app, no availability requirement. Owner: the user | 2027-02-01 |
| R3 | Estimated macros from the AI are wrong | A3 | H | L | accept | values flagged "estimated", editable; no medical decisions from them | accepted | Chosen by the user ("strictly AI for macros"). Owner: the user | when real use shows a problem |
| R4 | Field-level encryption of weight and finance is not implemented in the course phase | A1, A4, A5 | L | M | accept | platform encryption at rest, private network, owner-only access; schema leaves room for field encryption | accepted | `docs/security-plan.md` decision 3; revisit after the stack is chosen. Owner: the user | at stack decision |
| R5 | Gemini connector not confirmed on Google AI Plus; falling back to Claude only | n/a | M | L | accept | none needed | open | Feature gap, not a security risk; verify in Gemini settings. Owner: the user | when the connector is built |
