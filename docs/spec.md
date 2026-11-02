# Spec (DRAFT, built module by module in the planning Q&A)

Status: APPROVED by the user on 2026-11-02. Changes after this date go through the user and are recorded in `docs/decisions.md`. Nothing here is implemented. Cross-cutting decisions are in `docs/decisions.md`; the course checklist is `docs/requirements.md`.

## Cross-cutting (agreed so far)

- Platform: web/PWA first (iPhone via Home Screen, Mac). Only the owner uses it now; data is isolated per account (multi-user design).
- Offline logging is NOT needed for the course; nice to have after it (assume a connection).
- Modules are built in tiers (see Tiers below). Stack direction: TypeScript full-stack, Entra External ID for login, a queue for push reminders (`docs/decisions.md`).

## Module: Gym / sport

Agreed:
- Workouts follow a plan (split) the user defines: day -> ordered exercises -> target sets x rep range. Example: `docs/spec/gym-sample.md` (Upper/Lower, 5 days, 2 working sets per exercise).
- Logging a workout = per exercise, one line per set: `reps x load`. Example from the user's notes: `10 x 40 kg`, `12 x 4 plates`, `5 x bodyweight`, `7 x 5 plates + 1.25 kg`.
- Load types: free weight in kg; bodyweight (optionally + added kg); machine/cable stack in plates (optionally + small extra kg).
- A set can carry a flag (the user writes `!!`) meaning "something was not right". Exact meaning: open question.
- Exercise library: large preloaded library, plus the user can add their own exercises. Source and licence of the preloaded library: to be verified before choosing.
- Other sports (running, padel, hiking, ...): manual entry only for now. Import from Apple Fitness/Strava is a later item.

- `!!` marker, both kinds: automatic when reps fall below the target range (e.g. 3 reps vs 5-8), plus a manual flag with a reason (too heavy, pain, form, other) and an optional short note.
- Next to each exercise during a workout: last session (sets and loads), progress suggestion (when the top of the rep range is reached, suggest a higher load next time), personal record per exercise, last session's note, plus other useful hints (proposals below).
- Deload: the app counts weeks, reminds when the deload week (every 5 weeks) is due, labels that week and excludes it from progress charts. Plan days can be moved (e.g. a skipped Sunday).
- Week order confirmed: Sun Upper (chest), Mon Legs (hamstrings), Tue rest, Wed Upper (back), Thu Legs (quads), Fri Arms, Sat rest.

Accepted by the user (all):  estimated 1RM trend per exercise; hard sets per muscle group per week (the user trains few sets, so this is the key volume number); plateau hint (no progress in 3 sessions); per-set "partial reps at the end" toggle (part of the user's rules); optional kg-per-plate setting per machine so cable progress is comparable; post-workout summary (PRs, sets, duration); weekly consistency (workouts done vs planned) and the deload counter on the home screen.

## Module: Food + body weight

Links to the user's nutrition rules in `docs/spec/gym-sample.md` (170 g protein, 3350 kcal, 300+ g carbs, 10k steps, 3 L water, daily weigh-in). Body weight is health data: it never goes to an AI provider.

Agreed:
- Daily measures: kcal, protein, carbs, fat, fibre, water (3 L, tap counter), steps (always entered manually), body weight (daily weigh-in, 7-day average and weekly rate of change).
- Targets are fixed, editable defaults (3350 kcal, 170 g protein, 300+ g carbs), not tied to training days.
- Weekly meal plan -> automatic shopping list; plus "stock at home" (subtracts what is already there). Stock is a later tier.
- Meal logging by AI chat, no API: the app is a remote MCP server (a "custom connector") that the user adds to their own Claude (Pro/Max) and Gemini (Google AI Plus) accounts. Saying "I ate 200 g chicken and 150 g rice" in the chat makes the AI call the app's tools.
- **AI data line:** the connector may log and read food only: meals, macros, water, recipes, shopping list. Body weight and steps are never exposed to it.
- **Macros come strictly from AI estimates** (no recipe or food-database exactness). Every AI-logged value is flagged "estimated" and can be edited.
- A minimal manual entry form stays as an escape hatch, so the app works without any AI.
- Connector requirements (security): OAuth sign-in per user, per-user authorization on every tool call, narrow tools, tool input validated, AI-supplied text treated as untrusted (prompt injection). Read `ai-security.md` before building it.
- Connector support, checked 2026-11-02 (third-party sources, verify when building): Claude Pro/Max supports custom remote connectors. Gemini app custom MCP apps appeared mid-2026, but one source says they need the top tier (Ultra), so Google AI Plus may not be enough. If Gemini cannot, Claude is the primary chat and Gemini is a nice-to-have.
- Weekly meal plan: a fixed week that repeats by default, any day or meal can be changed for a given week.
- Recipes are kept: ingredients (feeds the shopping list) plus optional macros. Recipe macros are AI estimates or manual, flagged "estimated" like every other AI value.
- Shopping list is generated from the plan and grouped by category (meat, vegetables, dairy, ...).
- "Stock at home" stays a later tier.

## Module: Money

Agreed:
- Scope for now: expenses only (amount, category, date, note). Income, budgets and recurring subscriptions were not selected; they can be proposed again later.
- Entry: quick form, amount + category in 2-3 taps, most-used category preselected.
- Currency: RON only.
- **AI data line:** money stays out of the AI connector entirely. Finance is a sensitive category (strictest default in `AGENTS.md`).

## Module: Daily to-do (notifications)

Agreed:
- Two kinds of task: recurring (daily or weekly) and one-off tasks for a single day.
- The user chooses what goes on the list. No automatic entries from gym, food or weight.
- Notifications: web push through the PWA installed on the iPhone Home Screen (iOS 16.4 or later is required). Accepted as sufficient.
- Accepted additions: optional reminder time per task; unfinished one-off tasks roll over to the next day marked "carried over"; streak counter on recurring tasks; daily statistics (share of tasks completed per day).

## Module: Wishlist

Agreed:
- A single private list, only for the user's own wants. No gifts for other people.
- Item fields: name, link (URL), estimated price, priority. No photo (so no file upload).
- Bought items are simply deleted. No history, no link to Money.
- Not shared: owner-only, no read-only link.
- Open to propose: total estimated price of the list, sort by priority.

## Module: Family business

Agreed:
- The business sells products. Dashboard tracks income + expenses (profit per month) and a business to-do, kept separate from the personal Money and To-do modules.
- Not selected for now: customers/orders, stock.
- Access: owner only (no family accounts for now).
- **AI data line:** business finance stays out of the AI connector, same as Money.
- Open to propose: monthly profit chart, income and expense categories, reuse of the personal to-do component with a "business" scope.

## Tiers (January demo)

- Tier 1: account/login, Gym, Food + body weight (manual entry).
- Tier 2: Money, daily to-do with notifications, and the Food AI connector.
- Tier 3: Family business, Wishlist.
- Money and To-do are one implementation each with a "space" field (personal / business), so Business reuses them.
- Later tiers only start once the earlier one works end to end, deployed and torn down cleanly.

## Removed from scope

- Wedding module (Excel import + dashboard): removed by the user on 2026-11-02.
- Chess module: removed by the user on 2026-11-02.
- Health module (Apple Health / Apple Fitness integration) and its iOS component: removed by the user on 2026-11-02. Steps and body weight stay as manual daily entries in Food. Other sports stay manual in Gym.
- Work opportunities module: removed by the user on 2026-11-02.
- Projects / future development module: removed by the user on 2026-11-02.
