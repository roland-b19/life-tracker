Read only if the project uses large language models or other AI services.

# AI / LLM security

## When to read this
You design, build, review or verify a feature that sends data to a model (hosted API or local), shows model output, lets a model call tools, or retrieves documents for a model. Core rule: **a model is an untrusted component that follows instructions found anywhere in its input.** No prompt wording is a security boundary; enforce controls in deterministic code outside the model.

Checklist format: `- [ ] <ID> <rule>`. LLM01..LLM10 are OWASP Top 10 for LLM Applications 2025. ASVS IDs (5.0) keep their level (L1/L2/L3). `(note)` = not in the sources.

## Per-risk checklists

### LLM01 Prompt injection
Untrusted text (user input, web pages, files, emails, tool results, retrieved documents, even invisible or encoded text, images) changes model behaviour. Direct = typed by the user; indirect = arrives in content the model reads. No known complete prevention; limit the impact.
- [ ] LLM01.1 Give the model a narrow role and task in the system prompt, but never rely on it for enforcement.
- [ ] LLM01.2 Define the expected output format (schema) and validate it with deterministic code; reject anything else.
- [ ] LLM01.3 Filter input and output for sensitive categories. Treat filters as detection (log, rate-limit), not as a boundary: paraphrase, other languages, encodings, zero-width/Unicode tag characters (U+E0000..U+E007F) and look-alike letters bypass them. Match phrases, not single words, and measure false positives.
- [ ] LLM01.4 Normalise text (NFKC, strip invisible characters) before screening, and forward the same text you screened. Cap input length before normalising or decoding.
- [ ] LLM01.5 Least privilege: the app holds API tokens and calls functions in code; the model gets no credentials and the minimum tools.
- [ ] LLM01.6 Human approval for high-risk actions (see section "Using an AI provider").
- [ ] LLM01.7 Mark and segregate external content as untrusted data; never let it widen permissions or select tools/targets.
- [ ] LLM01.8 Render model output without live markup: strip or block HTML/Markdown images and links to arbitrary hosts (data exfiltration via `<img src=...?data=>`).
- [ ] LLM01.9 Adversarial tests: treat the model as an untrusted user; include indirect-injection cases in documents/tools, multi-turn and repeated-variation attacks (Best-of-N), encoded payloads, and benign look-alike prompts to measure false positives. Grade by observable effect (unauthorised tool call, data reaching a test sink, marker leaked), not by the model's reply. Count missing telemetry as inconclusive, not as "blocked".
- [ ] LLM01.10 Option for high-risk designs: split a privileged planner (never sees untrusted data) from a quarantined model that parses untrusted data with zero tool access (dual-LLM / CaMeL pattern). Research-grade; it does not stop misleading summaries.

### LLM02 Sensitive information disclosure
The model or its pipeline leaks personal data, secrets, proprietary data or system configuration through output, training, logs or shared context.
- [ ] LLM02.1 Sanitise/mask sensitive data before it enters prompts, training or fine-tuning sets, or retrieval stores (tokenisation, redaction by pattern).
- [ ] LLM02.2 Enforce per-user access control on every data source the model can read; restrict which sources are reachable at runtime.
- [ ] LLM02.3 Never put secrets, credentials or authorisation logic in the system prompt (see LLM07).
- [ ] LLM02.4 Document retention, usage and deletion; let users opt out of their data being used for training.
- [ ] LLM02.5 Do not return raw error or configuration details from the AI call path (API misconfiguration guidance).
- [ ] LLM02.6 Warn users not to enter sensitive data where the feature does not need it.
- [ ] LLM02.7 (note) Never share conversation context, memory or cache across users or tenants.

### LLM03 Supply chain
Third-party models, adapters, datasets, packages, plugins and hosting providers can be tampered with, outdated or carry bad licences/terms.
- [ ] LLM03.1 Vet suppliers including their terms and privacy policy; re-check when they change.
- [ ] LLM03.2 Apply normal dependency hygiene (scan, patch, pin) to every AI library and tool server.
- [ ] LLM03.3 Take models only from verifiable sources; check hashes/signatures; (note) prefer non-executable weight formats over pickle-style formats.
- [ ] LLM03.4 Evaluate and red-team a third-party model for your use case before adopting; published benchmarks can be gamed.
- [ ] LLM03.5 Keep an inventory (SBOM, plus ML/AI-BOM where tooling exists) of components, models, datasets and their licences.
- [ ] LLM03.6 Use a maintained version of the provider API/model; plan for deprecation.
- [ ] LLM03.7 Edge/on-device models: integrity-check and encrypt shipped model files; use platform attestation where available.

### LLM04 Data and model poisoning
Tampered training, fine-tuning, embedding or retrieval data inserts bias, backdoors or hidden instructions.
- [ ] LLM04.1 Track data origin and transformations; version datasets; verify legitimacy at each stage.
- [ ] LLM04.2 Vet data vendors; validate outputs against trusted sources.
- [ ] LLM04.3 Sandbox and gate access to unverified data; apply anomaly detection before data is used.
- [ ] LLM04.4 Keep user-supplied knowledge in a separate store (e.g. vector DB) instead of retraining; ground answers with retrieval.
- [ ] LLM04.5 Red-team for poisoning; monitor behaviour for anomalous outputs.

### LLM05 Improper output handling
Model output is passed to a browser, database, shell, interpreter or API without validation, so the model (or an injector) controls those sinks.
- [ ] LLM05.1 Treat model output like input from an anonymous user (zero trust); validate against a schema/allowlist before it reaches any backend function (ASVS 2.2.1 L1, 2.2.2 L1).
- [ ] LLM05.2 Context-aware output encoding for the destination: HTML, attribute, JS, URL, etc. (ASVS 1.2.1 L1, 1.2.2 L1, 1.2.3 L1).
- [ ] LLM05.3 Parameterised queries for any DB operation involving model output (ASVS 1.2.4 L1).
- [ ] LLM05.4 Never pass model output to a shell, `eval` or dynamic code execution (ASVS 1.2.5 L1, 1.3.2 L1); sanitise any model-produced HTML with a vetted sanitiser (ASVS 1.3.1 L1).
- [ ] LLM05.5 Strict Content Security Policy on pages that render model output.
- [ ] LLM05.6 If the model must fetch URLs, enforce an allowlist and do not follow redirects unless intended (ASVS 15.3.2 L2); (note) block internal address ranges (SSRF; ASVS 1.3.6 L2).
- [ ] LLM05.7 Log and alert on anomalous output patterns.

### LLM06 Excessive agency
A model-driven component has too many tools, too much functionality, too many permissions or too much autonomy, so a bad output causes damage.
- [ ] LLM06.1 Offer the minimum set of tools; remove tools the feature does not need (e.g. URL fetch).
- [ ] LLM06.2 Each tool does the minimum (read-only mailbox summary does not get delete/send).
- [ ] LLM06.3 No open-ended tools (run shell, fetch any URL, run any SQL); use narrow, parameter-validated functions.
- [ ] LLM06.4 Minimum downstream permissions (read-only DB account, scoped tokens).
- [ ] LLM06.5 Run tool calls in the end user's security context (per-user OAuth/token), never a shared super-account.
- [ ] LLM06.6 Human approval for high-impact actions.
- [ ] LLM06.7 Complete mediation: the downstream system authorises each call (ASVS 8.2.1 L1, 8.2.2 L1); never let the model decide whether an action is allowed.
- [ ] LLM06.8 Log and monitor tool activity; rate-limit actions; SAST/DAST on the integration.

### LLM07 System prompt leakage
The system prompt can be extracted, so anything secret in it is exposed, and relying on it for rules fails.
- [ ] LLM07.1 No secrets, keys, database names, role lists or permission structure in prompts.
- [ ] LLM07.2 Do not use the prompt to enforce behaviour that matters; enforce outside the model.
- [ ] LLM07.3 Independent guardrails inspect outputs outside the model.
- [ ] LLM07.4 Privilege separation and authorisation checks are deterministic and auditable, not delegated to the model.
- [ ] LLM07.5 (note) Assume the prompt is public; design so that leaking it costs nothing.

### LLM08 Vector and embedding weaknesses
RAG stores can leak data across users, be poisoned, or allow embedding inversion.
- [ ] LLM08.1 Permission-aware retrieval: partition the store per user/tenant/class and filter at query time by the caller's rights (ASVS 8.2.2 L1 logic applies).
- [ ] LLM08.2 Accept knowledge-base content only from verified sources; scan for hidden instructions; audit integrity regularly.
- [ ] LLM08.3 Tag and classify data when merging sources; do not mix access levels in one index.
- [ ] LLM08.4 Keep immutable logs of retrieval activity.
- [ ] LLM08.5 (note) Treat embeddings of sensitive data as sensitive data (same storage, retention, deletion).

### LLM09 Misinformation
The model produces plausible but false content (including non-existent libraries or facts) and users or code over-rely on it.
- [ ] LLM09.1 Ground answers with retrieval from trusted sources; show sources.
- [ ] LLM09.2 Automatic validation of key outputs in high-stakes flows; human review with trained reviewers.
- [ ] LLM09.3 Label AI-generated content and state limits in the UI; scope the intended use.
- [ ] LLM09.4 Verify any package/API/code the model suggests before use (invented package names are a supply-chain vector).
- [ ] LLM09.5 (note) Do not present model output as authoritative for medical, legal, financial or safety decisions.

### LLM10 Unbounded consumption
Uncontrolled inputs, loops or requests cause denial of service, runaway cost ("denial of wallet"), or model extraction.
- [ ] LLM10.1 Limit input size, output tokens, context length, retries, recursion depth and tool-chain length per request.
- [ ] LLM10.2 Rate limits and quotas per user/key (ASVS 2.4.1 L2); (note) hard spend cap and budget alert at the provider.
- [ ] LLM10.3 Timeouts and throttling for expensive operations; cap queued actions; degrade gracefully.
- [ ] LLM10.4 Sandbox the model's network and internal-service access.
- [ ] LLM10.5 Do not expose `logit_bias` or `logprobs` unless needed (extraction risk).
- [ ] LLM10.6 Log and alert on abnormal usage; access-control model registries and deployment pipelines.

## Using an AI provider with user data
- [ ] AI.1 Data minimisation: send only the fields the single task needs; strip identifiers and free text where possible; classify data first (ASVS 14.1.1 L2) and define per class whether it may leave your system (ASVS 14.2.3 L2: no defined sensitive data to untrusted parties).
- [ ] AI.2 Consent per feature and per data category: do not send a category of user data to a provider unless the user opted in for that feature; default off; allow withdrawal and tell the user which provider receives what. (note) Privacy practice, not from the sources.
- [ ] AI.3 Provider keys live server-side only (secrets manager, ASVS 13.3.1 L2, 13.3.2 L2). Never in client code, mobile binaries, URLs (ASVS 14.2.1 L1) or prompts. (note) If a client needs the model, proxy through your backend, which authenticates and authorises the caller.
- [ ] AI.4 Per-user rate and cost limits plus a global spend cap (LLM10, ASVS 2.4.1 L2); authenticate every call to the AI endpoint.
- [ ] AI.5 Treat model output as untrusted: encode for the sink, validate against a schema, never execute or `eval` it (LLM05).
- [ ] AI.6 Human confirmation for any side effect (write, send, delete, pay, share, change permission). Show a preview of the exact action; bind approval to actor, tool, target, normalised parameters and an expiry; execution component re-checks authorisation; fail closed when classification, approval or audit logging fails; make irreversible actions idempotent; step-up authentication for critical actions.
- [ ] AI.7 Content the model reads (web pages, uploads, emails, notes, other users' data) can carry instructions: keep tools that read untrusted content separate from tools with side effects or access to private data; (note) never let one call chain combine untrusted input, private data and an outbound channel without approval (exfiltration path).
- [ ] AI.8 Logging: record metadata (user id, feature, data categories sent, model/version, token counts, decision taken, errors), not prompt or response content, and never credentials (ASVS 16.2.5 L2; log attempts to bypass controls, ASVS 16.3.3 L2).
- [ ] AI.9 Before choosing a provider, read its data-retention, training-on-your-data, region, sub-processor and deletion terms; prefer a plan or setting with no training on inputs and minimal retention. Re-check on terms changes. (note) Contractual terms differ between consumer and API/enterprise tiers.
- [ ] AI.10 (note) Privacy option: run a local/on-device model for sensitive data so it never leaves the device or your network; accept lower capability, and still validate its output (LLM05) and verify model file integrity (LLM03).
- [ ] AI.11 Per-user isolation of memory, conversation history and retrieval; never write unvalidated model or user content into persistent agent memory.
- [ ] AI.12 (note) Kill switch: a config flag disables the AI feature without a redeploy; the app must still work without it.
- [ ] AI.13 (note) Re-run the adversarial test set after any change to prompt, tools, retrieval, model or provider.

## How to verify
1. Draw the data-flow: what leaves to the provider (categories), what comes back, which sinks consume it, which tools it can call. Each arrow needs an entry above.
2. Grep for provider keys in client code, repos, logs and build artefacts.
3. Test with injected documents and prompts that try to: call an unlisted tool, read another user's data, leak the prompt, emit script/markup, loop until the cost cap hits. Observe effects, not replies.
4. Confirm the spend cap and per-user limits actually trigger.

## Common mistakes
- Putting "never do X" in the prompt and calling it a control.
- One shared service account behind the model, so any user reaches any data.
- Rendering model Markdown/HTML with remote images enabled.
- Logging full prompts that contain user data.
- Trusting a guardrail model or keyword filter as the only defence.

Sources: OWASP Top 10 for LLM Applications 2025, files `2_0_vulns/LLM01..LLM10*.md` (repo `www-project-top-10-for-large-language-model-applications`, commit 99f4395, 2026-08-05; CC BY-SA 4.0; https://genai.owasp.org/llm-top-10/). OWASP Cheat Sheet Series: `LLM_Prompt_Injection_Prevention_Cheat_Sheet.md`, `AI_Agent_Security_Cheat_Sheet.md` (commit 1abd866, 2026-11-01; CC BY-SA 4.0; https://cheatsheetseries.owasp.org/). OWASP ASVS 5.0 (commit 9ccce0e, 2026-10-26; CC BY-SA 4.0): 1.1-1.3, 2.2, 2.4, 8.2, 13.3, 14.1-14.2, 15.3, 16.2-16.3. ASVS has no LLM-specific chapter. Rewritten and condensed; attribution to OWASP retained. No newer superseding LLM Top 10 edition was found in the checkout.
