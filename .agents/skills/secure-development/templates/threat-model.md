# Threat model: <system name>

Owner: <who>  ·  Last reviewed: <date>  ·  Review trigger: new module, new data type, new external service, new trust boundary, before each release.
Procedure: `references/threat-modeling.md`.

## 1. Scope and assumptions
- In scope: <components>
- Out of scope: <what and why>
- Assumptions: <for example "cloud provider platform is trusted">

## 2. Assets
| ID | Asset | Sensitivity (public / internal / personal / secret / regulated, e.g. special-category) | Where stored | Impact if exposed, altered, lost |
|---|---|---|---|---|

## 3. Actors
| Actor | Trust level | Capabilities / motivation |
|---|---|---|

## 4. Data-flow diagram
<diagram or list of flows: actor -> component -> store; mark every trust boundary>

## 5. Threats (STRIDE per element)
| ID | Element / flow | S | T | R | I | D | E | Threat | Mitigation | Requirement ref (for example ASVS id) | Status (open / mitigated / accepted) |
|---|---|---|---|---|---|---|---|---|---|---|---|

## 6. Abuse cases
| ID | Abuse case ("as an attacker I ...") | Preconditions | Expected defence | Test that proves it |
|---|---|---|---|---|

## 7. Risks accepted
Move to `risk-register.md`.
