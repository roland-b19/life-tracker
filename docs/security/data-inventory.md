# Data inventory and privacy design: Life Tracker

Last reviewed: 2026-11-05 (daily task statistics). Update in the same change that adds a data type, a store, a recipient or a purpose.
Classification: personal / health (GDPR Art. 9 special category) / financial / secret. The legal basis is the owner's own use of their own data (single user); revisit if other users are ever added.

| Data type | Examples | Classification | Purpose | Legal basis / consent | Stored where, how protected | Retention | Shared with (third parties, AI providers) | User can export | User can delete |
|---|---|---|---|---|---|---|---|---|---|
| Body weight, steps | daily weigh-in, step count | health | track progress | owner's own data; explicit, never shared | database, private network, platform encryption at rest, owner-scoped (private reachability and encryption are designed, not Azure-runtime verified) | until the owner deletes | **nobody; never to an AI provider** | yes (JSON/CSV) | yes |
| Gym logs | exercises, `reps x load`, pain/form flags, notes | personal (notes may mention injury) | training progress | owner's own data | database, owner-scoped | until deleted | none | yes | yes |
| Food logs | meals, macros (AI-estimated, flagged), water | personal | nutrition tracking | owner's own data; the AI chat is opt-in by adding the connector | database; AI connector reads and writes it | until deleted | **the AI provider chosen by the owner (Claude or Gemini), only through the connector and only for food data** | yes | yes |
| Meal plan, recipes, shopping list | weekly plan, ingredients | personal | planning | owner's own data | database; also reachable through the connector | until deleted | same as food logs | yes | yes |
| Task statistics | per day and space: tasks planned and done (frozen daily snapshot, table `todo_day_stats`, no task text) | personal | progress dashboard on Tasks | owner's own data | database, owner-scoped, least-privilege grant for the app role | until deleted | none; never to an AI provider | yes | yes |
| Personal expenses | amount, category, date, note | financial | budgeting | owner's own data | database, owner-scoped | until deleted | none; never to an AI provider | yes | yes |
| Business income and expenses (legacy, no UI since 2026-11-05) | profit per month, categories | financial / business | none; tables kept, unused | owner's own data | database; business space requires the business role | until deleted | none; never to an AI provider | yes | yes |
| To-do tasks | recurring and single-day tasks, reminder time, personal and business space | personal | planning, reminders | owner's own data | database, queue (task id and title only) | until deleted | push gateway of the platform (Apple/Google) sees only a short notification | yes | yes |
| Wishlist | name, URL, estimated price, priority | personal | purchase planning | owner's own data | database | until deleted | none | yes | yes |
| Account identity | email, subject id, MFA | personal | login, authorization | contract/own account | Microsoft Entra External ID | while the account exists | Microsoft (identity provider) | n/a (provider) | yes (deletes account) |
| Local development identity | issuer `dev`, subject user name | personal | local authentication and authorization tests | local development only | local PostgreSQL, owner-scoped | until local database is deleted | none | n/a | yes |
| Auth.js session | signed JWT in an HttpOnly cookie | secret | keep the user signed in | owner authentication | browser cookie, signed by `NEXTAUTH_SECRET` from Key Vault in Azure | 4 hours absolute | none | n/a | sign out |
| Runtime configuration secrets | database URL, Auth.js signing secret, Entra client secret | secret | connect the app to private services and authenticate OIDC | service operation | Azure Key Vault, private endpoint, user-assigned identity with vault-scoped Secrets User role (template only; runtime reachability and secret absence from logs are unverified) | rotate on compromise or scheduled review | none | n/a | remove with deployment |
| Weight entry | date and kilograms | health | daily weigh-in | owner's own data | local PostgreSQL, owner-scoped | until deleted | none; never to an AI provider | yes (later export) | yes |
| Connector tokens | Scoped bearer tokens for Claude MCP / Gemini | secret | let the AI act for the owner | owner generates explicitly | database (`api_tokens` table, SHA-256 hashed, plaintext shown once) | until revoked | the AI client holds the bearer token | n/a | no UI since 2026-11-05: revoke by deleting the `api_tokens` row, or set `AI_CONNECTOR_ENABLED=false` |
| Push subscriptions | endpoint, keys per device | secret-ish | send reminders | owner enables notifications | database | until logout or revoke | platform push gateway | no | yes |
| Operational logs | request id, user id, status codes, security events | personal (ids only) | security monitoring, debugging | legitimate interest of the owner | log store, access restricted | 30 days **(stack: confirm)** | none | no | expire |
| Backups | database snapshots | same as the data inside | recovery | same | planned platform backup, encrypted; no Azure backup or restore has been deployed or tested | 35 days or less, set when the database is chosen | none | no | expire |

## Rules for this system
- **Data never sent to external providers:** body weight, steps, personal expenses, business finance, gym notes, account data, push subscriptions, logs. No health data to any AI provider (`docs/decisions.md`). The connector endpoint exposes no tool for these.
- **Data sent only with explicit per-feature consent:** food (meals, macros, water, recipes, plan, shopping list) through the Food connector, default off until the owner adds the connector in their own Claude or Gemini account. Before enabling: check the training and retention settings of that consumer plan and disable training on chats where the plan allows it (AI.9).
- **Logging excludes:** tokens and secrets, request and response bodies of weight, money and business endpoints, food and AI content, push endpoints. Log metadata only (user id, route, status, request id).
- Analytics and tracking: none.
- Deletion removes every row of the user in one transaction, including queue and push entries. Backups age out by retention.
