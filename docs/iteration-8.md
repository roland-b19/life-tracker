# Iteration 8: Tier 3 — Wishlist & Family Business Dashboard

Date: 2026-11-04  
Status: Planned / Approved  
Specification reference: `docs/spec.md` (Modules: Wishlist, Family Business)  
Security standards: ASVS 5.0 L2, OWASP Top 10:2025, Strict AI Data Line Quarantine (`AGENTS.md`)

---

## 1. Objectives & Scope

Iteration 8 completes **Tier 3** of Life Tracker by delivering the final two modules defined in the approved specification:
1. **Wishlist**: A private list of purchase desires (name, store link, estimated price in RON, priority: low/medium/high). Displays total estimated cost, filtering/sorting by priority, and simple one-tap deletion when bought.
2. **Family Business Dashboard**: A dedicated space for the owner's family business, tracking products sold:
   - Monthly profit calculation: `Monthly Profit = Monthly Incomes - Monthly Business Expenses`.
   - Income logging (amount in RON, category, date, description).
   - Business expenses overview (reusing the `expenses` table with `space: 'business'`).
   - Business to-do tasks (reusing the `todos` table with `space: 'business'`).
   - **Strict AI Data Line Quarantine:** Zero exposure of business incomes, profits, or finances to any AI connector.

---

## 2. Architecture & Database Design

### 2.1 Database Schema (`src/db/schema.ts`)

#### Table: `wishlist_items`
- `id`: UUID (Primary Key, default random)
- `userId`: UUID (Foreign Key -> `users.id`, cascade delete)
- `name`: VARCHAR(120), NOT NULL
- `url`: VARCHAR(500), nullable
- `estimatedPrice`: NUMERIC(10, 2), NOT NULL (Check constraint: `estimatedPrice > 0`)
- `priority`: VARCHAR(10), NOT NULL (`'low' | 'medium' | 'high'`, default `'medium'`)
- `createdAt`: TIMESTAMP WITH TIME ZONE (default now)
- Index on `(userId, priority)`

#### Table: `business_incomes`
- `id`: UUID (Primary Key, default random)
- `userId`: UUID (Foreign Key -> `users.id`, cascade delete)
- `amount`: NUMERIC(12, 2), NOT NULL (Check constraint: `amount > 0`)
- `category`: VARCHAR(50), NOT NULL (default `'Sales'`)
- `date`: DATE, NOT NULL (format YYYY-MM-DD)
- `note`: VARCHAR(255), nullable
- `createdAt`: TIMESTAMP WITH TIME ZONE (default now)
- Index on `(userId, date)`

### 2.2 Reusing Existing Modules (Ponytail Pattern)
- Business expenses will use the existing `expenses` table with `space = 'business'`.
- Business tasks will use the existing `todos` table with `space = 'business'`.
- No duplicated schemas or redundant code.

---

## 3. Implementation Steps

### Step 1: Database Schema & Migration
- Add `wishlistItems` and `businessIncomes` in `src/db/schema.ts`.
- Generate Drizzle migration `drizzle/0008_...sql` with proper `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO life_tracker_app;`.
- Apply migration locally to `life_tracker` and `life_tracker_test`.
- Update `scripts/db-init.cjs` for cloud parity.

### Step 2: Data Access Layers & Validations
- `src/lib/validations/wishlist.ts`: Zod schema for wishlist item creation (`name`, optional `url`, `estimatedPrice > 0`, `priority`).
- `src/lib/wishlist.ts`:
  - `getWishlist(userId)`
  - `addWishlistItem(userId, input)`
  - `deleteWishlistItem(userId, id)`
  - `getWishlistStats(userId)` (total items, total estimated cost).
- `src/lib/validations/business.ts`: Zod schema for business income logging.
- `src/lib/business.ts`:
  - `getBusinessDashboard(userId, month)` (totals, profit = income - expenses, business tasks).
  - `addBusinessIncome(userId, input)`
  - `deleteBusinessIncome(userId, id)`

### Step 3: Server Actions
- `src/app/actions/wishlist.ts`:
  - `addWishlistItemAction`
  - `deleteWishlistItemAction`
- `src/app/actions/business.ts`:
  - `addBusinessIncomeAction`
  - `deleteBusinessIncomeAction`
  - Re-export or invoke `addExpenseAction` and `createTodoAction` with pre-filled `space: 'business'`.

### Step 4: Apple HIG User Interfaces
- **`/wishlist`**:
  - Summary header with Total Wishlist Estimated Cost (in RON) and item counter.
  - Priority segmented filter: All, High, Medium, Low.
  - Quick add form with inline validation.
  - Item cards displaying item title, price, priority badge, external link button, and Delete button.
- **`/business`**:
  - Top summary cards: Total Incomes, Total Expenses, Net Profit (highlighted green if positive, orange if negative).
  - Month selector.
  - Income and expense breakdown.
  - Integrated Business Tasks section (reusing task check/uncheck with `space: 'business'`).
- Navigation update:
  - Update `app/components/navigation.tsx` to include `Wishlist` and `Business` in top navigation or dropdown.

### Step 5: Verification & Automated Tests
- `tests/wishlist.test.ts`:
  - Multi-user isolation (User A cannot view or delete User B's wishlist items).
  - Validation rules (reject negative prices, invalid URLs, empty titles).
  - Total calculation and sorting.
- `tests/business.test.ts`:
  - Multi-user isolation for business incomes.
  - Profit calculation (`income - expenses`).
  - Separation between `personal` and `business` spaces.
  - Strict AI Quarantine assertion: verify business incomes/profits are not accessible in AI tools.

### Step 6: PR, Review & CI Merge
- Run `npm run lint` and `npm run typecheck`.
- Run all Vitest tests.
- Verify Next.js production build (`next build`).
- Update `docs/STATUS.md` and `docs/decisions.md`.
- Create pull request and merge into `main`.
