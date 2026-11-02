Read only if the target hosting is Microsoft Azure.
Skip it for any other cloud or for self-hosting.

# Cloud security checklist: Microsoft cloud security benchmark (MCSB) for Azure

**When to read this:** you design, deploy or review infrastructure and platform configuration on Azure (network exposure, identity, secrets, logging, backups, pipelines). It complements the application-level references; it does not replace them.
Line format: `- [ ] <MCSB id> (L<n>) rule`. MCSB itself has no levels, so L1/L2/L3 here is a `(note)` prioritisation: **L1** = small-project baseline (do always), **L2** = production with real user data, **L3** = multi-team / regulated organisations. L2 includes L1; L3 includes L1+L2. `(note)` = not from the sources.

Contents: Version, Small-project baseline, Domains (NS IM PA DP AM LT PV ES BR DS GS, IR), Per-service notes, How to verify, Common mistakes, Sources.

## Version used

- Control IDs and titles: MCSB **v1** (stable) for AM, LT, PV, ES, BR, DS, IR, GS. NS, IM, PA and DP use **v2 (preview)** wording; all four domains were checked against both v1 and v2 pages on 2026-11-02 and the IDs match, except IM-1, NS-7 and PA-6 (retitled in v2) and IM-9 (v1 only).
- On 2026-11-02 the canonical learn.microsoft.com benchmark pages are v2 (page date 2026-01-15) and state that v2 supersedes v1; v1 stays published under `overview-mcsb-v1`. Check which version your tooling (policy initiative, Defender for Cloud) is mapped to before quoting IDs.
- What v2 changes (verified on the pages): new domain **AI Security** (AI-1 to AI-7, see `ai-security.md` if LLM features exist), more than 420 built-in Azure Policy definitions mapped to controls, per-control risk and threat sections, numbered sub-guidance, implementation examples, a criticality tag (Must have / Should have / Nice to have), mappings to NIST SP 800-53 r5, PCI-DSS v4, CIS v8.1, NIST CSF 2.0, ISO 27001:2022 and SOC 2. v2 has no Governance and Strategy (GS) page, retitles DS-2 to DS-7, and drops IM-9 (v1 only).

## Small-project baseline (ordered by value)

Do these before anything else; every item maps to the control in brackets.
- [ ] (L1) Databases, storage, queues and Key Vault are **not reachable from the public internet**: private endpoint, or at minimum the service firewall set to deny-by-default with explicit allow rules. [NS-2, NS-1]
- [ ] (L1) Workloads authenticate to other Azure services with a **managed identity**, not connection strings or keys; use Entra authentication to the database where supported. [IM-3, IM-8]
- [ ] (L1) Remaining secrets, keys and certificates live in **Key Vault** (RBAC authorization, soft delete and purge protection on); never in source, images, pipeline variables in clear or app settings in clear. [IM-8, DP-6, DP-8]
- [ ] (L1) **Azure RBAC with least privilege**: assign built-in roles to groups or identities at the narrowest scope (resource or resource group), no subscription-wide Owner/Contributor for workloads, no standing admin where a just-in-time role works. [PA-7, PA-2, PA-1]
- [ ] (L1) **Encrypt in transit**: HTTPS only, minimum TLS 1.2 (note: prefer 1.3 where the service offers it), disable plaintext protocols and FTP. [DP-3, NS-8]
- [ ] (L1) Encryption at rest stays on (default for most services; do not disable). Customer-managed keys only when a requirement asks for them. [DP-4, DP-5]
- [ ] (L1) Enable **diagnostic settings** (resource logs and the Activity Log) to a Log Analytics workspace or storage account; set a retention you chose on purpose (note: the Activity Log is kept 90 days by default and is lost after that unless exported). [LT-3, LT-5, LT-6]
- [ ] (L1) **Tag every resource** (for example `project`, `env`, `owner`) so ownership and cost are traceable and teardown can be scripted. [AM-1]
- [ ] (L1) Turn on **Microsoft Defender for Cloud** (free foundational recommendations at least; paid plans for the services you actually run) and work the recommendation list top-down. [PV-1, PV-2, LT-1]
- [ ] (L1) **Budget and cost alerts** on every subscription or resource group; a leaked key or runaway resource shows up as spend first. (note) [AM-1]
- [ ] (L1) **Scan IaC and pipelines** (templates, Terraform/Bicep, workflow files) with a linter or policy scanner and enable secret scanning on the repository; deploy only from the pipeline identity (federated credentials, no long-lived secrets). [DS-2, DS-3, DS-4, DS-6, IM-8]
- [ ] (L1) Infrastructure is **scripted** (IaC or CLI in version control), not portal click-ops, so a state is reproducible and reviewable. (note) [PV-1]
- [ ] (L1) **Ephemeral environments are torn down** by deleting their resource group; keep a teardown script next to the deploy script and keep an inventory of what currently exists. (note) [AM-1, AM-3]
- [ ] (L2) Backups enabled for every stateful service with a retention period set and a **restore actually tested**. [BR-1, BR-4]
- [ ] (L2) Policy guardrails (Azure Policy initiative, see "How to verify") in audit mode first, then deny for the items you never want (public blob access, public database endpoint). [PV-2, AM-2]

## NS Network security

- [ ] NS-1 (L2) Segment workloads in virtual networks and subnets; control traffic between segments with network security groups (NSG) or firewalls, default deny.
- [ ] NS-2 (L1) Secure PaaS resources (database, storage, vault, queue) with Private Link/private endpoints, VNet service integration, or the service firewall; disable public network access when a private path exists. Network Security Perimeter is the newer option for grouped PaaS services (note).
- [ ] NS-3 (L2) Put a firewall at the network edge for inbound and egress filtering; restrict outbound to what is needed.
- [ ] NS-4 (L3) Use network IDS/IPS (for example firewall premium or an equivalent) for threat signatures.
- [ ] NS-5 (L2) Enable DDoS protection on internet-facing public IPs/VNets that need it.
- [ ] NS-6 (L2) Put a web application firewall in front of public web apps and APIs (for example in front-door or application-gateway style services), in prevention mode after tuning.
- [ ] NS-7 (L3) Manage network rules centrally (firewall policy, Virtual Network Manager, policy) rather than per resource.
- [ ] NS-8 (L1) Detect and disable insecure services and protocols (old TLS, SMB1, Telnet, plain FTP, anonymous or weak auth modes).
- [ ] NS-9 (L3) Connect on-premises or other clouds privately (VPN or dedicated circuit), not over open internet paths.
- [ ] NS-10 (L2) Secure DNS: use a trusted resolver, private DNS zones for private endpoints, protect against dangling DNS records (subdomain takeover) by removing records when a resource is deleted.

## IM Identity management

- [ ] IM-1 (L1) One central identity provider (Entra ID) for people and workloads; avoid separate local accounts per service; keep admin and ordinary identities isolated.
- [ ] IM-2 (L2) Protect the identity system itself: no stale or unmanaged admin accounts, secure the tenant configuration, monitor for risky sign-ins.
- [ ] IM-3 (L1) Use managed identities (or workload identity federation) for applications; where a service principal is unavoidable, use certificates or federated credentials, not long-lived secrets, and give it least privilege.
- [ ] IM-4 (L2) Authenticate servers and services to each other (managed identity or mutual TLS), never trust the network position alone.
- [ ] IM-5 (L2) Use single sign-on for application access instead of per-app passwords.
- [ ] IM-6 (L1) Require strong authentication (MFA, passwordless or phishing-resistant) for all human users, administrators first.
- [ ] IM-7 (L2) Restrict access by conditions (Conditional Access: location, device, risk, session) for admin and sensitive applications.
- [ ] IM-8 (L1) Never expose credentials or secrets in code, repositories, images, logs, templates or pipeline output; scan for them (secret scanning) and rotate on exposure.
- [ ] IM-9 (L3) (note) v1 only: secure user access to existing legacy applications (SSO or app proxy in front); dropped in v2.

## PA Privileged access

- [ ] PA-1 (L1) Keep the number of highly privileged (Owner, Global Administrator, User Access Administrator) accounts small; use separate admin accounts or roles.
- [ ] PA-2 (L2) Avoid standing privileges: use just-in-time elevation (Privileged Identity Management) with approval and expiry.
- [ ] PA-3 (L2) Manage identity and entitlement lifecycle: joiners, movers, leavers, guest accounts and service principals removed when no longer needed.
- [ ] PA-4 (L2) Review and reconcile access on a schedule (access reviews), remove unused assignments.
- [ ] PA-5 (L2) Set up emergency (break-glass) access that is monitored and excluded from the controls that could lock everyone out.
- [ ] PA-6 (L3) Administer from a privileged access solution (privileged or secure workstations, bastion/jump host), not from daily-use machines.
- [ ] PA-7 (L1) Just enough administration: least-privilege RBAC at the narrowest scope; prefer built-in roles, custom roles only when needed.
- [ ] PA-8 (L3) Decide how the cloud provider's support staff may access your data (for example Customer Lockbox approval).

## DP Data protection

- [ ] DP-1 (L2) Discover, classify and label sensitive data (for example with Microsoft Purview or Defender sensitive-data discovery); know where regulated data lives.
- [ ] DP-2 (L2) Monitor for anomalies and threats against sensitive data stores (Defender for Storage / SQL / databases, access and exfiltration alerts).
- [ ] DP-3 (L1) Encrypt data in transit with TLS 1.2 or higher on every endpoint, internal ones included; enforce HTTPS-only/secure-transfer settings.
- [ ] DP-4 (L1) Keep encryption at rest enabled by default; add infrastructure/double encryption only if a requirement asks.
- [ ] DP-5 (L3) Use customer-managed keys when policy or regulation requires control over the key, and accept the operational cost (rotation, availability).
- [ ] DP-6 (L1) Run a documented key management process: generate, rotate, expire, revoke and recover keys in Key Vault or Managed HSM; separate key duties.
- [ ] DP-7 (L2) Manage certificates centrally with automated renewal and expiry alerts; no self-signed certificates in production paths.
- [ ] DP-8 (L1) Secure the key and certificate repository itself: RBAC, private endpoint/firewall, soft delete, purge protection, logging, Defender for Key Vault.

## AM Asset management

- [ ] AM-1 (L1) Maintain an inventory of resources with tags (owner, environment, project) and review the security risks of each (Defender for Cloud inventory, Resource Graph).
- [ ] AM-2 (L2) Allow only approved services and regions (Azure Policy allowed-resource-types/locations); block the rest.
- [ ] AM-3 (L2) Secure the asset lifecycle: remove unused or orphaned resources and identities, tear down ephemeral environments.
- [ ] AM-4 (L3) Limit who can change asset-management settings (policy, inventory, tags, subscriptions).
- [ ] AM-5 (L3) Allow only approved applications on virtual machines (application control or allow-listing).

## LT Logging and threat detection

- [ ] LT-1 (L1) Enable threat detection (Defender for Cloud plans for the services in use).
- [ ] LT-2 (L2) Enable threat detection for identity and access (Entra sign-in and audit logs, risky-sign-in alerts).
- [ ] LT-3 (L1) Enable logging for security investigation: resource logs, Activity Log, application audit logs (who did what, when, from where; no secrets in logs).
- [ ] LT-4 (L3) Enable network logging (NSG flow logs, firewall and WAF logs, DNS logs). (note) Microsoft is retiring NSG flow logs in favour of virtual network flow logs; check the current Network Watcher docs.
- [ ] LT-5 (L2) Centralise logs in one workspace or SIEM (Log Analytics, Microsoft Sentinel), with alert rules.
- [ ] LT-6 (L2) Set retention deliberately (for example 90 days hot plus archive per your obligation); restrict who can delete or alter logs.
- [ ] LT-7 (L3) Use approved time sources so timestamps correlate across systems (default platform NTP is usually enough for PaaS).

## PV Posture and vulnerability management

- [ ] PV-1 (L1) Define secure configuration baselines in code (IaC templates, hardened defaults, per-service security baselines).
- [ ] PV-2 (L1) Audit and enforce them continuously (Azure Policy, Defender for Cloud recommendations and secure score); fix drift.
- [ ] PV-3 (L2) Define secure configurations for compute (VM images, container base images, minimal and patched).
- [ ] PV-4 (L2) Audit and enforce compute configuration (guest configuration, image scanning, auto-update).
- [ ] PV-5 (L2) Run vulnerability assessments (images, VMs, dependencies, registry scanning) on a schedule and before release.
- [ ] PV-6 (L2) Remediate quickly and automatically (patch management, dependency update bots), with a target time per severity.
- [ ] PV-7 (L3) Conduct red-team or penetration exercises regularly, within the provider's permitted-testing rules.

## ES Endpoint security

(Mostly for VMs and admin machines; PaaS-only projects can mark these not applicable with a reason.)
- [ ] ES-1 (L2) Run endpoint detection and response (EDR) on VMs and admin workstations (Defender for Servers/Endpoint).
- [ ] ES-2 (L2) Use modern anti-malware on VMs; for storage, enable malware scanning on upload where files come from outsiders (note: Defender for Storage malware scanning).
- [ ] ES-3 (L2) Keep anti-malware engines and signatures updated automatically.

## BR Backup and recovery

- [ ] BR-1 (L2) Automate regular backups of data, configuration and secrets stores; define RPO/RTO that backups can meet.
- [ ] BR-2 (L2) Protect backups: separate scope or vault, encryption, immutability or soft delete, restricted delete rights.
- [ ] BR-3 (L2) Monitor backup jobs and alert on failures.
- [ ] BR-4 (L2) Test restore regularly and record the result; an untested backup is not a backup.

## DS DevOps security

- [ ] DS-1 (L2) Threat-model the workload and its pipeline (for example STRIDE) before building and when the design changes.
- [ ] DS-2 (L1) Secure the software supply chain: pin and verify dependencies and base images, keep an SBOM, restrict registries to approved sources.
- [ ] DS-3 (L1) Secure the DevOps infrastructure: least-privilege pipeline identities (federated, no stored secrets), protected branches and required reviews, hardened runners, environment approvals for production deploys.
- [ ] DS-4 (L1) Run static application security testing (SAST) in the pipeline; fail the build on agreed severities.
- [ ] DS-5 (L2) Run dynamic application security testing (DAST) against a test deployment.
- [ ] DS-6 (L2) Secure the workload across its lifecycle: scan IaC and images, gate releases on results, sign or attest artifacts, no secrets in artifacts.
- [ ] DS-7 (L2) Log and monitor the DevOps tooling itself (audit logs of repository, pipeline and registry changes) and alert on unusual activity.

## GS Governance and strategy

v1 only (no GS page in v2). Strategy-level items for organisations; a small project can satisfy them with one short document.
- [ ] GS-1 (L3) Assign security roles, responsibilities and accountability (who owns the subscription, who responds to alerts).
- [ ] GS-2 (L3) Separate duties and segment the organisation's environments and subscriptions (prod versus non-prod).
- [ ] GS-3 (L3) Have a data protection strategy (classification, encryption, access).
- [ ] GS-4 (L3) Have a network security strategy.
- [ ] GS-5 (L3) Have a security posture management strategy (who reviews secure score and how often).
- [ ] GS-6 (L3) Have an identity and privileged access strategy.
- [ ] GS-7 (L3) Have a logging, threat detection and incident response strategy.
- [ ] GS-8 (L3) Have a backup and recovery strategy.
- [ ] GS-9 (L3) Have an endpoint security strategy.
- [ ] GS-10 (L3) Have a DevOps security strategy.
- [ ] GS-11 (L3) Have a multi-cloud security strategy (only if more than one cloud is used).

## IR Incident response (short)

- [ ] IR-1 (L2) Keep a written incident response plan and handling process, with contacts.
- [ ] IR-2 (L2) Route security alerts to named people (Defender for Cloud contact settings, action groups).
- [ ] IR-3 (L3) Create incidents from high-quality alerts only, to avoid alert fatigue.
- [ ] IR-4 (L3) Have a way to investigate (logs queryable, snapshots of affected resources).
- [ ] IR-5 (L3) Prioritise incidents by impact and asset criticality.
- [ ] IR-6 (L3) Automate handling where safe (playbooks, automation rules).
- [ ] IR-7 (L3) After an incident: lessons learned and retention of evidence.

## Per-service notes

Per-service security baselines exist at `learn.microsoft.com/security/benchmark/azure/baselines/<service>-security-baseline`. The pages marked below looked partly stale (feature support lagging the product); verify on the service's own security page before relying on them. (note) Service facts below are the author's knowledge cross-checked against those baselines; the bracketed IDs only point to the related control.

**App Service / Container Apps**
- Use managed identity for outbound calls and for pulling images from a registry; turn off registry admin user. [IM-3]
- HTTPS only, minimum TLS 1.2, FTP/basic-auth publishing off. [DP-3, NS-8]
- Restrict inbound with access restrictions, private endpoint or an ingress that is internal-only for non-public apps; use VNet integration for outbound private access. [NS-2]
- Secrets: reference Key Vault (App Service Key Vault references; Container Apps secrets from Key Vault with managed identity). (note) The Container Apps baseline page says Key Vault secrets are unsupported; this is outdated, check the current docs.
- Built-in authentication (Entra) can protect the app without code, but still enforce authorization in the app. (note)

**Azure SQL / PostgreSQL (flexible server)**
- Disable public network access and use a private endpoint, or restrict by firewall rules plus VNet rules; never `0.0.0.0-255.255.255.255`. [NS-2]
- Prefer Entra authentication with the app's managed identity over SQL/password logins; keep an Entra admin and disable shared admin passwords where possible. [IM-3]
- TLS enforced with minimum 1.2 (`require_secure_transport` on PostgreSQL). (note)
- Auditing/diagnostic logs on; Defender for SQL/open-source relational databases for threat detection; backups with tested restore. [LT-3, LT-1, BR-1]
- (note) The PostgreSQL baseline page lists Private Link as unsupported and Entra authentication as preview; both are outdated, check current docs.

**Storage account**
- Disable anonymous blob access, require secure transfer, minimum TLS 1.2, disable shared-key (account key) access where clients can use Entra. [DP-3, IM-8, NS-2]
- Network: deny by default with private endpoint or selected-network rules. [NS-2]
- Prefer short-lived user-delegation SAS tokens with minimal permissions over account keys; set expiry. (note) [IM-8]
- Enable soft delete and versioning for blobs and data you cannot lose; Defender for Storage for malware and anomaly detection. [BR-1, DP-2]

**Key Vault**
- RBAC authorization model; soft delete and purge protection on; private endpoint or firewall; diagnostic logs on; Defender for Key Vault. [DP-8, LT-3]
- Separate vaults per environment (and sensitivity) so a compromise of one does not expose the rest. (note)
- Rotate secrets and keys; set expiry dates and alerts for certificates. [DP-6, DP-7]

**Service Bus (and similar messaging)**
- Use Entra/managed identity with the built-in data sender/receiver roles; disable or avoid SAS keys with `Manage` rights. [IM-3, PA-7]
- Private endpoint or IP firewall and minimum TLS 1.2 (premium tier is needed for private endpoints; note). [NS-2]
- Diagnostic logs to a workspace; use per-queue/topic role scope. [LT-3]

## How to verify

Read-only checks only; none of these change a resource. `az` examples are `(note)` and may change between CLI versions.
- **Azure Policy:** assign the built-in initiative "Microsoft cloud security benchmark" (note: the exact name and ID differ between v1 and v2, look it up in the portal's Policy definitions before assigning) to the subscription in audit mode, then review compliance. Defender for Cloud assigns the default initiative automatically.
- **Defender for Cloud:** open Recommendations and the secure score; work the recommendations by severity; use the Regulatory Compliance dashboard for MCSB status.
- (note) `az network private-endpoint list -g <rg> -o table` shows which services have private endpoints.
- (note) `az storage account show -n <name> --query "{pub:allowBlobPublicAccess, tls:minimumTlsVersion, https:enableHttpsTrafficOnly, net:networkRuleSet.defaultAction}"` should show no public blob access, TLS1_2 or higher, HTTPS only, default action Deny.
- (note) `az keyvault show -n <vault> --query "properties.{rbac:enableRbacAuthorization, purge:enablePurgeProtection, soft:enableSoftDelete, net:networkAcls.defaultAction}"`.
- (note) `az role assignment list --all --query "[?roleDefinitionName=='Owner'||roleDefinitionName=='Contributor'].{p:principalName,r:roleDefinitionName,s:scope}" -o table` shows broad assignments to review.
- (note) `az resource list --query "[?tags.project==null].id" -o tsv` lists untagged resources.
- (note) Azure Resource Graph queries can list resources with `publicNetworkAccess` enabled across subscriptions.

## Common mistakes

- Private endpoint created but public network access left enabled, or the private DNS zone not linked so clients fall back to the public address.
- Connection string or storage key kept "temporarily" in app settings or the repository; keys never rotated.
- Owner/Contributor assigned at subscription scope to a pipeline or application identity.
- Firewall rule "allow all Azure services" treated as private: it admits every tenant's Azure resources.
- Purge protection off on Key Vault, so a deleted-then-purged secret or vault cannot be recovered (note: soft delete is always on for current vaults, check older ones).
- Diagnostic settings never enabled, so there is no evidence after an incident.
- Test or demo environments left running and exposed after the exercise; no teardown, no budget alert.
- Treating a Defender for Cloud secure score as proof of security; it only measures configuration, not application flaws.

## Sources

Microsoft cloud security benchmark, learn.microsoft.com/security/benchmark/azure (overview, per-domain control pages, per-service security baselines). Fetched 2026-11-02. IDs and titles from v1 (`overview-mcsb-v1`, AM, LT, PV, ES, BR, DS, IR, GS pages) and v2 preview (NS, IM, PA, DP pages; canonical pages dated 2026-01-15 state v2 supersedes v1). Service baselines read: App Service, Container Apps, SQL Database, PostgreSQL flexible server, Storage, Key Vault, Service Bus (some pages stale, see notes). Licence: unclear for the rendered learn.microsoft.com pages (the site Terms of Use at learn.microsoft.com/legal/termsofuse restrict copying and derivatives without written consent, unless a document states its own licence). The MicrosoftDocs/SecurityBenchmarks GitHub repository (spreadsheet copy of the benchmark) is CC BY 4.0 for content and MIT for code. This file is therefore a paraphrase with IDs, titles and links, not a copy; attribute Microsoft and link to the source. L1/L2/L3 tiers and all `(note)` lines are the author's, not Microsoft's.
