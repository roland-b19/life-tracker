# Supply chain, CI/CD, secrets hygiene, containers, IaC

## When to read this
Read when you add or update a dependency, write or review a build/CI/CD pipeline, handle a secret, write a Dockerfile or infrastructure-as-code, or decide which automated security checks a project needs. Covers ASVS 5.0 V13 (secrets/config) and V15.1/V15.2 (dependencies), Top 10:2025 A03 and A08, and the OWASP cheat sheets listed in `Sources`.
Lines marked `(note)` come from general knowledge, not from the bundled sources. Verify them before relying on them.

Level key: `L1` baseline, `L2` standard for most apps, `L3` high assurance. Target L2 unless told otherwise.

---

## 1. Dependencies (ASVS V15.1/V15.2, Top 10 A03)

### Checklist
- [ ] V15.1.1 (L1) Documentation defines risk-based remediation time frames for vulnerable third-party components and for updating libraries in general. Write the numbers down (example: critical = days, high = weeks; pick your own and record them).
- [ ] V15.2.1 (L1) No component in the shipped app has exceeded those time frames.
- [ ] V15.1.2 (L2) Keep an inventory of all third-party libraries (an SBOM). Check that each comes from a pre-defined, trusted, maintained repository.
- [ ] V15.2.3 (L2) Production contains only what the app needs: no test code, sample snippets, dev tooling (also covers unused dependencies).
- [ ] V15.2.4 (L3) Direct and transitive dependencies come from the expected repository; no dependency confusion risk.
- [ ] V15.1.4 (L3) Document "risky components" (unmaintained, huge attack surface, native code, unusual privileges).
- [ ] V15.1.5 (L3) Document where "dangerous functionality" is used (dynamic code execution, deserialization, shell calls, etc.).
- [ ] V15.2.5 (L3) Add extra isolation around risky components and dangerous functionality (sandbox, container, network isolation).
- [ ] A03 Track versions of every component including nested dependencies, the OS, runtimes, servers and databases, not only application libraries.
- [ ] A03 Fix or upgrade on a risk-based schedule. A monthly or quarterly patch window leaves days or months of exposure.
- [ ] A03 Test updated libraries for compatibility before shipping (have tests that exercise the code that uses the dependency).

### Rules of thumb
1. **Fewest dependencies.** Before adding one: can the standard library or an already-installed dependency do it? A dependency is permanent attack surface and a maintenance cost (A03: remove unused dependencies, features, files).
2. **Vet before adding.** Check: actively maintained, popular enough, mature, a release version (not alpha/beta), several maintainers, keeps its own dependencies updated, has tests, documents a vulnerability-reporting process, licence fits (Software Supply Chain cheat sheet, "Assess Suppliers").
3. **Commit the lockfile** (exact versions plus integrity hashes). In CI install strictly from the lockfile (npm: `npm ci`; yarn: `yarn install --frozen-lockfile`). Other ecosystems have equivalents (note).
4. **Choose versions deliberately; upgrade when needed**, but do not stand still: pair pinning with automated update PRs so pinned does not mean stale. Do not rush to the newest release: read the changelog and test first (NPM sheet). (note) Waiting a short time before adopting a brand-new release is a common extra precaution.
5. **Disable install-time scripts of third-party packages** where the ecosystem has them (npm: `--ignore-scripts` or `ignore-scripts=true` in project config; allowlist the few that need them). Worm-style attacks (Top 10 A03 scenario 3, 2025) spread through post-install scripts.
6. **Typosquatting and slopsquatting.** Never install a package an AI tool or a README suggested without checking it exists and is the real one: registry page, download count, real repository with history, publish date, maintainers. Brand-new package with no history = suspicious. Copy-pasted install commands: verify the name character by character.
7. **Dependency confusion.** Internal package names must not be claimable on the public registry: use scoped/prefixed names, point the scope at the private registry in committed config, reserve names publicly, and configure the package manager with a single trusted feed where possible.
8. **Official sources only**, over TLS. Never download a package from a random website. Prefer signed packages or ones with provenance.
9. (note) **Do not copy documentation examples into production unreviewed.** Examples are sometimes weaker than the library's own defaults (weak hashes, unanchored regex, predictable randomness).

### Responding to a vulnerable dependency (cheat sheet cases, condensed)
1. Fixed version exists: update in a test environment, run tests, ship. Act on the **direct** dependency; transitive fixes usually come by upgrading its parent.
2. Fix is blocked (major break, pinned transitive, unmaintained line): confirm the upgrade is really blocked, record the blocker, mitigate narrowly (disable or isolate the affected feature; a validation wrapper only if analysis shows it blocks every reachable exploit path), and track the real fix. Backporting a patch is a deliberate last resort.
3. No fix coming: look for a maintained replacement; patch yourself only as a last resort.
4. Any in-house patch must have a test that **fails** against the vulnerable version and **passes** against the patched one. Silencing the scanner or editing a version string is not remediation.
5. Suppress a scanner finding per CVE (never per whole package), with a written reason and an expiry/review date.
6. Accepting a risk is an explicit, recorded decision by whoever owns the risk, based on technical analysis and severity.

### Vulnerability sources to watch
CVE/NVD, OSV, GitHub Advisory Database, CISA KEV catalog, vendor bulletins. Subscribe to alerts for the components you use; automate it (SCA tool in CI plus scheduled runs, because new CVEs appear for code that did not change).

### SBOM (Dependency Graph & SBOM cheat sheet)
- Use a standard machine-readable format (CycloneDX or SPDX (note)). Record component names, versions, suppliers, package identifiers, hashes, direct and transitive relationships, plus product, author, generation time and generator version.
- Generate on every release, **after** dependency resolution, and reconcile with the final package or container image (include bundled libraries and OS packages). A manifest alone can misrepresent what ships. Record known gaps; absence from an SBOM is not proof of absence.
- Validate the document against the format schema; keep each release's SBOM separately; keep the original files.
- Optional (higher assurance): bind the SBOM to the artifact digest with a signed attestation; signing artifact and SBOM separately does not prove they belong together. A valid signature proves origin and integrity, not that the SBOM is complete or the software safe.
- Use SBOMs for response: when an advisory lands, map it to releases/deployments, prioritise by exploitability, exposure and impact. A VEX "not affected" claim must be authenticated and checked against your exact version and deployment before you accept it.

---

## 2. CI/CD pipeline security (CI/CD cheat sheet, A03, A08)

Principle (A03): the pipeline must not be weaker than what it builds and deploys. It runs with high privilege, so compromising it is often worse than compromising the app.

### Source control settings
- [ ] Default branch is protected: no direct pushes, no force-push, no deletion.
- [ ] Pull request review is required and cannot be bypassed (including by admins where the platform allows). No single person writes code and promotes it to production unreviewed (A03 separation of duties; for a one-person project, make the required checks and CI the second pair of eyes and note the limit).
- [ ] Required status checks (tests plus the security gates in section 8) must pass before merge.
- [ ] No auto-merge rules that bypass review (CI/CD cheat sheet says avoid auto-merge). (note: auto-merge of dependency-update PRs is a judgement call; if used, limit to patch updates with passing checks.)
- [ ] MFA on every account with write access to the repository, registry or cloud.
- [ ] Signed commits where practical (cheat sheet: require commits to be signed).
- [ ] Limit external contributors' permissions, repository forking of private repos, and who can make a repository public.
- [ ] Pipeline definitions live in version control and are reviewed like code. If the CI config sits next to the code, review it before merging every change (poisoned pipeline execution, CICD-SEC-4).
- [ ] Production deployment requires a manual approval or an explicitly protected environment.

### Pipeline execution
- [ ] **Least privilege everywhere** (CICD-SEC-5): each job gets only the permissions it needs. (note) On GitHub Actions: set the default token to read-only and grant write scopes per job with a `permissions:` block.
- [ ] Use short-lived, federated credentials for cloud access instead of long-lived keys stored in the CI system (note: OIDC federation / workload identity). ASVS V13.2.1 (L2) says not to rely on unchanging credentials for service authentication.
- [ ] (note) Separate credentials per pipeline and per environment; no sharing across pipelines of different sensitivity; no "one big secret" with wide blast radius.
- [ ] **Pin third-party actions/plugins/images to an immutable reference** (full commit SHA or image digest), not a moving tag or branch. (note) Add a comment with the human-readable version and let the update bot bump it. Pin tools you download in a job the same way, and verify checksums.
- [ ] Treat third-party plugins and integrations like software acquisition: reputable maintainer, popular, maintained, least privilege, remove when unused.
- [ ] (note) Untrusted input must never reach a shell or a privileged context: PR titles, branch names, commit messages, issue text and fork-PR code are attacker-controlled. (note) On GitHub Actions: do not run code from a fork PR with secrets; pass untrusted values through environment variables, not inline into `run:` scripts; be wary of triggers that give fork PRs write tokens or secrets.
- [ ] (note) Minimise user-controllable build parameters.
- [ ] Builds run in isolated nodes; no `--privileged` containers in pipeline steps. (note) Prefer ephemeral environments destroyed after the run, no shared caches between trust levels (cache poisoning), and a non-root OS user for the pipeline.
- [ ] CI platform and its runners are patched and hardened; (note) keep an inventory of build tools with versions.
- [ ] CI/CD communication uses TLS 1.2 or higher.

### Secrets in pipelines (also section 3)
- [ ] Never hardcode secrets in repository or pipeline files; store them in the CI secret store or a vault.
- [ ] (note) Secrets are never printed, logged, echoed in debug output or written to artifacts or command history. Enable the platform's masking, but do not rely on it (encoded or split secrets bypass masking).
- [ ] (note) No debug or "exec into the runner" access to production pipelines.
- [ ] (note) Forks and copied job definitions must not receive secrets.
- [ ] Log all pipeline and admin actions (queryable at least 90 days per Secrets cheat sheet 3.4); alert on unusual secret access or pipeline changes; never log secret values.

### Integrity of what you ship (A08)
- [ ] Consume only from trusted repositories; consider an internal vetted mirror at higher risk.
- [ ] Verify downloaded software against signatures or checksums; never `curl | sh` unverified code in builds or Dockerfiles.
- [ ] Do not load scripts or other code from third-party CDNs or hosts you do not control without integrity checks (note: Subresource Integrity hashes for browser scripts).
- [ ] Do not trust unsigned serialized data from clients (see the injection/deserialization references).
- [ ] Optional (higher assurance): sign build artifacts and publish build provenance; consumers verify before install (Sigstore, in-toto, SLSA are the cheat sheet's pointers). Signing is not a guarantee: the signing process itself must be protected.
- [ ] Scan the final build output (binary/image), not only source, for exposed secrets and unexpected components.
- [ ] Prefer staged rollouts for updates so a compromised vendor release does not hit everything at once (A03).

### Common mistakes
- Third-party action referenced by branch or tag (`@main`, `@v1`) with write token and secrets in scope.
- Workflow default token with write access to everything.
- Secret echoed by a debug step, or passed on a command line that is logged.
- Long-lived cloud key in CI variables, shared by every project.
- Lockfile ignored: CI runs a plain install that re-resolves versions.
- Scanner results exist but nobody is required to read them; gates are advisory only and never block a merge.

---

## 3. Secrets hygiene (ASVS V13.3, Secrets Management cheat sheet)

### Checklist
- [ ] V13.3.1 (L2) Use a secrets-management solution (vault/key vault or the platform's equivalent) to create, store, control access to and destroy backend secrets. Secrets are **not** in source code and **not** in build artifacts. (L3: hardware-backed, such as an HSM.)
- [ ] V13.3.2 (L2) Least privilege for access to secrets: each service identity can read only its own secrets.
- [ ] V13.3.3 (L3) Cryptographic operations happen inside an isolated security module so key material never leaves it.
- [ ] V13.3.4 (L3) Secrets expire and are rotated per the documented schedule.
- [ ] V13.1.4 (L3) Documentation lists the security-critical secrets and a rotation schedule.
- [ ] V13.2.1 (L2) Service-to-service calls use individual service accounts, short-term tokens or certificates, not static passwords, API keys or shared privileged accounts.
- [ ] V13.2.2 (L2) Backend components use accounts with the least privilege they need.
- [ ] V13.2.3 (L2) No default credentials (root/root, admin/admin) on any service.
- [ ] V13.4.1 (L1) Deploy without `.git`/`.svn` metadata, or make it unreachable externally and by the app.

### Practices
1. **Prefer identity over secrets**: managed/workload identity or short-lived tokens beat stored keys; the fewest secrets are the ones that do not exist.
2. Keep config separate from code: secrets arrive from environment or a secret store at runtime. Commit only a template with placeholder values (for example `.env.example`) and git-ignore the real file.
3. (note) Different secrets per environment (dev/test/prod); a developer's laptop never holds production secrets.
4. (note) Never put secrets in URLs, container images, build args, client-side code, mobile app bundles, logs, error messages or CI output.
5. Metadata: record owner, purpose, who/what uses it, rotation method and the downstream things that break on rotation, so rotation is safe to do (cheat sheet 2.11, 8.4).
6. Test secrets: use one standard fake value per secret type in tests so scanners can allowlist it with few false positives.

### Detection, in three layers (cheat sheet section 8)
1. **Before commit**: a local pre-commit hook (section 9).
2. **On push / in PR**: platform push protection (blocks the push) and secret scanning of the repository, including history.
3. **In CI**: a scan of the full history on a schedule and on each PR; use more than one detector if you can and correlate (cheat sheet 8.1). Also scan container images and build artifacts.

### Leak response: rotate first
Order matters; removing the secret from the repository does not make it safe again, because it is already copied.
1. **Revoke/rotate immediately.** Assume it is compromised the moment it was pushed anywhere shared, even briefly or in a private repo.
2. Issue the replacement through your normal automated path, with least privilege, and update consumers.
3. **Check usage**: review the provider's logs for who used the old secret and when, from where; look for unfamiliar activity. (cheat sheet: log who had access, when it was used, when it was last rotated.)
4. Remove it from the current code, logs and artifacts. Rewriting git history is optional, breaks other links to commits and does not undo the exposure; if you do it, plan for it (cheat sheet 9.2). Never rewrite published history just to feel safe.
5. Record what happened and fix the cause (missing hook, missing push protection, shared secret).

---

## 4. Container hygiene (Docker cheat sheet; applies to any OCI container)

- [ ] Run as a **non-root user** (`USER` in the Dockerfile; Kubernetes `runAsUser`, `runAsNonRoot`). Rule #2.
- [ ] Drop all Linux capabilities and add back only what is needed (`--cap-drop all --cap-add <x>`). Never run `--privileged`. Rule #3.
- [ ] Set `no-new-privileges` (Kubernetes `allowPrivilegeEscalation: false`). Rule #4.
- [ ] Read-only root filesystem with `tmpfs` for scratch space, volumes `:ro` where possible. Rule #8.
- [ ] Set memory, CPU, process and file-descriptor limits (DoS control). Rule #7.
- [ ] Never expose the Docker daemon socket to a container or over the network. Rule #1.
- [ ] Publish ports only to the interfaces you mean (bind to `127.0.0.1` for local-only services). Rule #5a. Be mindful of inter-container connectivity (no default "everything talks to everything"). Rule #5.
- [ ] Keep host, engine and base images patched. Rule #0.
- [ ] Pin the base image version (best: by digest); pin OS package versions where practical; prefer `COPY` over `ADD`; no `curl | sh` in `RUN`. Rule #9 lint list.
- [ ] Scan images in CI for known vulnerabilities, secrets and misconfiguration; run a Dockerfile linter. Rule #9.
- [ ] Secrets are injected at runtime (orchestrator secrets, mounted files, workload identity), never baked into layers, build args or environment files committed to the image. Rule #12. Remember Compose file-backed secrets are plain bind mounts: protect the source files.
- [ ] Supply chain for images: provenance, an SBOM per image, signing, a registry with strict access control, deploy only validated images. Rule #13.
- [ ] (note) **Minimal base image**: prefer slim or distroless-style images and multi-stage builds so compilers, shells, package managers and build secrets do not reach the final image. Smaller image = fewer CVEs and less for an attacker to use. Check that your app still runs and can be debugged without a shell (use ephemeral debug containers).
- [ ] (note) Add a `.dockerignore` so `.git`, `.env`, keys and local config never enter the build context.
- [ ] Optional hardening: seccomp/AppArmor/SELinux profiles, runtime behaviour monitoring (Falco and similar), rootless Docker/Podman (Rules #6, #11).

How to verify: `docker inspect` the user and capability settings; run the image scanner on the built image (not just the Dockerfile); confirm `docker history`/image layers contain no secrets.

---

## 5. Infrastructure as code (IaC cheat sheet, A03, A08)

- [ ] All infrastructure is defined in code and version-controlled **with the feature that needs it** (same branch/PR), reviewed like application code. No unrecorded manual changes (drift).
- [ ] Least privilege twice: who may create/update/run/delete the IaC, and the permissions the IaC grants to the resources it creates.
- [ ] No secrets in IaC files or state. State files can contain secrets: do not commit them; store remotely with encryption and restricted access. (note)
- [ ] Static analysis of IaC on every PR (misconfiguration scanners; IDE plugins give earlier feedback).
- [ ] Scan open-source dependencies/modules/providers the IaC uses; pin their versions.
- [ ] Scan container images referenced by the IaC.
- [ ] Tag/label every resource (owner, project, environment) so nothing becomes an untracked "ghost resource"; on deletion, remove configuration and data and update the inventory. Untagged resources are a posture and cost risk.
- [ ] Enable security and audit logging when provisioning, and monitoring/alerting for violations.
- [ ] Prefer immutable infrastructure: change by replacing from the new spec, not by patching live.
- [ ] Threat-model the infrastructure early; high-risk, high-volume components first.
- [ ] Optional: runtime threat detection; sign artifacts at build and verify before use.
- [ ] (note) Common scan findings to fix by default: public network exposure of data stores, public object storage, wildcard IAM permissions, unencrypted storage, disabled logging, overly permissive firewall rules, default credentials. Also see V13.2.4/13.2.5 (L2): allowlist what the server can reach.

---

## 6. SAST, DAST, SCA: what each is for

| Technique | Looks at | Finds | Limits |
|---|---|---|---|
| SAST (static analysis) | Your source code | Injection patterns, dangerous API use, hardcoded secrets, some logic bugs | False positives and negatives; needs human triage; cannot see runtime config |
| SCA (dependency scan) | Manifests, lockfiles, images | Known-vulnerable components and licences | Only known CVEs; version match is not reachability |
| Secret scanning | Code, history, images | Committed credentials | Misses secrets with unusual formats |
| IaC scanning | Infrastructure code | Misconfiguration before deploy | Misses what the live environment drifted into |
| Container scanning | Built images | OS/package CVEs, secrets, misconfig | Point-in-time; rescan regularly |
| DAST (dynamic scan) | A running app | Misconfiguration, missing headers, injection and auth flaws visible from outside | Needs a deployed test target; shallow without authenticated, scripted coverage |
| Manual review/pen test | Everything | Business logic and authorization flaws tools miss | Costly; periodic |

Rules: automate in CI (Software Supply Chain: security automation); never accept tool output unchecked (SAST results need manual verification and are not a complete view); keep the tools themselves patched and configured, since a neglected tool adds risk; point DAST only at systems you own or are authorised to test, never at production data you cannot afford to damage.

---

## 7. Check -> purpose -> candidate tools

Tools are **candidates**, not requirements. Details marked `(note)` are not confirmed by the bundled sources: **verify current pricing/availability before relying** (free tiers and feature sets change, and some features depend on repository visibility or plan).

| Check | Purpose | Candidate tools |
|---|---|---|
| Secret scanning + push protection | Stop credentials entering the repo; find ones already there | GitHub secret scanning and push protection (note: availability/cost depends on repo visibility and plan); gitleaks, TruffleHog, ggshield, git-secrets (named in OWASP sheets); Yelp detect-secrets (Secrets sheet) |
| Pre-commit secret/lint hook | Catch problems before they leave the laptop | Any of the secret scanners above run as a local hook (section 9) |
| Dependency update automation | Keep versions current via reviewable PRs | Dependabot (note), Renovate (named in the Vulnerable Dependency sheet) |
| SCA / vulnerable dependency audit | Known CVEs in direct and transitive dependencies | Ecosystem audit command (e.g. `npm audit`); OWASP Dependency-Check, OWASP Dependency-Track, Trivy, Grype, retire.js; Snyk, JFrog Xray (commercial) |
| SAST | Flaws in your own code | CodeQL (note), Semgrep (note); language-specific linters |
| IaC scan | Misconfiguration in infra code | Checkov (named in IaC sheet), TFLint, KICS (Docker sheet), Trivy config scanning (note) |
| Container image scan | CVEs, secrets, misconfig in images | Trivy, Grype, Clair (named in Docker sheet); Docker Scout, Anchore, Snyk (commercial) |
| Dockerfile lint | Insecure Dockerfile patterns | hadolint (note), Dockle (note), Docker Bench for Security (Docker sheet) |
| SBOM generation | Inventory per release for audit and response | Syft + CycloneDX/SPDX output (Syft named in the Vulnerable Dependency sheet; CycloneDX in the SBOM sheet); CycloneDX tooling per ecosystem (note) |
| Provenance / signing (optional) | Verify artifact origin and integrity | Sigstore, in-toto, SLSA verifier (CI/CD and SSC sheets); GitHub artifact attestations (note) |
| DAST | Runtime checks against a test deployment | OWASP ZAP (IaC sheet lists ZAP and Burp) |
| Repo/CI settings audit | Find weak SCM/CI settings | Legitify (CI/CD sheet; GitHub and GitLab); OpenSSF Scorecard (note) |
| Pipeline workflow linter | Catch dangerous CI patterns (injection, over-broad permissions, unpinned refs) | (note) GitHub Actions linters such as zizmor or actionlint; verify they fit your CI platform |

---

## 8. Security gates in the definition of done

A change is not done until each applicable gate is true. Mark "n/a" with a reason instead of skipping silently.

- [ ] No secrets in the diff or history; secret scan passed; real `.env`/key/state files are git-ignored.
- [ ] Any new dependency is justified (cannot be avoided), vetted, from the official registry, pinned in a committed lockfile, and its install scripts are disabled or reviewed.
- [ ] Dependency audit shows no finding above the documented remediation time frame (V15.2.1); every suppression is per CVE with a reason and review date.
- [ ] SBOM or dependency inventory updated for the release (V15.1.2, L2).
- [ ] SAST (or at least linter security rules) clean or triaged; findings are fixed or explicitly accepted with a reason.
- [ ] CI workflow changes: minimal permissions, third-party references pinned to immutable IDs, no untrusted input in shell, no new long-lived secret.
- [ ] Container changes: non-root, no extra capabilities, pinned base, image scan clean or triaged, no secrets in layers.
- [ ] IaC changes: scanner clean or triaged, resources tagged, no public exposure that is not intended, state and secrets not committed.
- [ ] Default branch protection and required checks still enforced; change merged through a reviewed PR.
- [ ] Production has no debug mode, test code, sample data or exposed docs/monitoring endpoints (V13.4.2, V13.4.5, V15.2.3, L2).
- [ ] Rotation and ownership documented for any new secret (V13.1.4, V13.3.4, L3).
- [ ] If a leak is suspected: rotated first, then cleaned up.

---

## 9. Minimal pipeline for a small project (ordered by value per effort)

Do these in order; stop when you reach the effort you can sustain. Each step is small and keeps working without the next.

1. **Protect the default branch and require PRs and a passing check** (minutes; (note) done in repository settings). Turn on MFA for every account that can write.
2. **Commit the lockfile and install strictly from it in CI.** Run tests in CI on every PR.
3. **Turn on platform secret scanning and push protection** if offered, and add a local pre-commit secret hook (recipe below). Cheapest protection against the most common real-world leak.
4. **Automated dependency updates** (Dependabot/Renovate class) plus a dependency vulnerability audit step in CI that fails on findings above your threshold.
5. **Least-privilege CI**: read-only default token, per-job write scopes, third-party actions pinned to commit SHAs, no secrets exposed to fork PRs.
6. **SAST in CI** (a free semantic scanner such as CodeQL or Semgrep class) as a required check; triage findings instead of muting them.
7. **Container and IaC scanning** in CI if you ship images or infra code (one tool such as Trivy-class covers images and much of IaC; Checkov-class for deeper IaC).
8. **SBOM generated per release** and stored with the release artifact.
9. **Scheduled full-history secret scan and scheduled dependency rescan** (weekly), since new vulnerabilities appear for unchanged code.
10. **DAST against a throwaway test deployment** before significant releases.
11. (Higher assurance) Signed commits, signed artifacts with provenance, SHA-pinned images, environment approval gates, private registry mirror.

Teardown note: if infrastructure is ephemeral, keep scans on the IaC (they run without the infrastructure existing) and keep logs/audit evidence outside the thing you delete.

### Pre-commit hook recipe (generic)
Goal: block a commit that contains a credential, before it exists in history.
1. Pick a secret scanner that can scan **staged changes only** (it should be fast, under a few seconds).
2. Create an executable file `pre-commit` in the repository's git hooks location (default `.git/hooks/`; or set `core.hooksPath` to a committed directory such as `.githooks/` so the whole team shares it).
3. The script runs the scanner on staged changes and exits non-zero on any finding. Exit code non-zero makes git abort the commit.
4. If the scanner is missing, the hook should **fail loudly with an install hint** (or warn if you prefer not to block), not silently pass.
5. Optional additions in the same hook: block files by name (`.env`, `*.pem`, `*.key`, state files), run the formatter/linter, run a fast unit-test subset.
6. Treat bypass (`--no-verify`) as an exception. Because hooks are local and skippable, **always have the same scan in CI and push protection on the server**: the hook is a convenience, the server-side check is the control.
7. Allowlist known fake test values narrowly (per value or per file), with a comment saying why; never allowlist whole directories of real configuration.
8. Document the one-line setup command in the contributing notes, and have bootstrap/setup scripts install it so it is not forgotten.

---

## Sources
- OWASP ASVS 5.0, V13 Configuration (13.1.x, 13.2.x, 13.3.x, 13.4.x) and V15.1/V15.2 (`ASVS/5.0/en/0x22-V13-Configuration.md`, `0x24-V15-Secure-Coding-and-Architecture.md`). Git master checkout, commit `9ccce0e3cf47abd6a412fc8a8deadd7fd6da501f` (2026-10-26). Licence CC BY-SA 4.0. https://github.com/OWASP/ASVS. Items for 13.1.1-3, 13.2.4-6, 13.4.2-7, 15.1.3 and 15.2.2 are covered in `platform-data-ops.md` (or only referenced in sections 5 and 8 here); V15.3/V15.4 (defensive coding, concurrency) belong to other files.
- OWASP Top 10:2025, A03 Software Supply Chain Failures and A08 Software or Data Integrity Failures (`Top10/2025/docs/en/`), repository commit `3a31f35346c3f4e90f350395124382fa53af2afe` (2026-09-24). Licence CC BY-SA 4.0 (`Top10/LICENSE`). https://owasp.org/Top10/
- OWASP Cheat Sheet Series (commit `1abd8667e9311f7ae54eb9be8fc1e28cc6a15de9`, 2026-11-01), CC BY-SA 4.0 (the IaC sheet carries its own header, CC BY-SA 3.0, Nokia): CI_CD_Security, Software_Supply_Chain_Security, Dependency_Graph_SBOM, Vulnerable_Dependency_Management, Secrets_Management, Docker_Security, Infrastructure_as_Code_Security, NPM_Security (also used for ecosystem-neutral supply chain rules). https://cheatsheetseries.owasp.org/
- Not used: NIST SSDF (`ssdf.pdf`) was not consulted for this file. CI platform-specific hardening (GitHub Actions permissions, SHA pinning, fork-PR handling), minimal base images, `.dockerignore`, state-file handling and all tool pricing/feature statements are `(note)` items from general knowledge, not from the bundled sources.
- Currency: no source here appears superseded as of 2026-11-02 (ASVS 5.0 and Top 10:2025 are current editions). Tool availability changes quickly; re-check before adopting.
