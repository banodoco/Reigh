# Budget-Based Task Processing System

_Design document – updated v2_

## 1  Motivation
Our platform needs to meter computationally expensive tasks (e.g. image generation, video travel) against a **budget balance** that customers can top-up via Stripe or through manual grants. A task should only transition from **`Start` → `Processing`** when sufficient budget is available; otherwise it remains queued.

Key requirements:
1. Purchasable budget (Stripe Checkout / Customer Portal).
2. Admin-granted or promotional budget.
3. Atomic, server-side deduction when a worker starts a task.
4. Protection against double-spending and race conditions.
5. Transparent ledger for auditing / refunds.

## 2  Data Model (Drizzle)
```ts
// users table already exists in the schema. We add a cached `credits` column
// (migration: `ALTER TABLE users ADD COLUMN credits integer NOT NULL DEFAULT 0`)
// Note: Despite the name "credits", this stores budget in cents (so $1.00 = 100 cents)

creditsLedger = pgTable('credits_ledger', {
  id: uuid().primaryKey(),
  userId: uuid().references(() => users.id).notNull(),
  taskId: uuid(),                 // nullable for top-ups
  amount: integer().notNull(),    // positive = top-up, negative = spend (in cents)
  type: varchar().notNull(),      // 'stripe' | 'manual' | 'spend' | 'refund'
  metadata: jsonb(),
  createdAt: timestamp().defaultNow(),
});
```
**Balance** = `sum(amount)` for a user (in cents). We maintain a cached `users.credits` via triggers for quick checks.

### DB Trigger (Postgres / Supabase)
```sql
CREATE FUNCTION refresh_user_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET credits = (
    SELECT COALESCE(SUM(amount),0) FROM credits_ledger WHERE user_id = NEW.user_id
  ) WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER credits_ledger_after_ins
AFTER INSERT ON credits_ledger
FOR EACH ROW EXECUTE FUNCTION refresh_user_balance();
```
The same trigger can be reused for updates/deletes if ever needed.

## 4  Adding Budget
### 4.1  Stripe Integration
1. Client initiates checkout/session for a dollar amount (e.g. $50).
2. Stripe Checkout → redirects to success URL.
3. **Supabase Edge Function** (`/functions/stripe-webhook`) listens for `checkout.session.completed` + `invoice.paid` events.
4. On event, insert positive ledger row (`type='stripe'`) inside a **single call** – no client involvement.

Security: Verify Stripe signature; lookup account via `customer` metadata.

### 4.2  Manual Grants
* Admin dashboard or SQL console inserts a row with `type='manual'`.
* Could be exposed via an internal REST endpoint protected by service role key.

## 5  Consuming Budget (Worker Server)
The worker that dequeues tasks is **the single authority** for deduction.

```ts
await db.transaction(async (tx) => {
  const user = await tx.query.users.findFirst({
    where: eq(users.id, userId),
    locking: { strength: 'update' }, // FOR UPDATE
  });
  const cost = estimateCost(task); // deterministic function (returns cents)
  if ((user?.credits ?? 0) < cost) throw new InsufficientBudgetError();

  await tx.insert(creditsLedger).values({
    userId, taskId: task.id, amount: -cost, type: 'spend',
  });
  await tx.update(tasks).set({ status: 'processing' }).where(eq(tasks.id, task.id));
});
```
The `FOR UPDATE` lock guarantees two workers cannot deduct simultaneously.

### Retry / Failure Handling
* If the worker crashes **after** deducting but **before** completing the task, refund strategy:
  * a scheduled job scans `tasks` stuck in `processing` beyond N minutes → refunds ledger (+cost, type='refund').

## 6  API Surface (App → Server)
The React app does **not** deduct budget directly. It needs only:
* `GET /api/credits/balance` → shows remaining budget.
* `GET /api/credits/ledger?limit=100` → for history UI.
* `POST /api/credits/checkout { amount }` → returns Stripe Checkout URL for dollar amount.
Admin-only:
* `POST /api/credits/grant { userId, amount, reason }`.

## 7  Security & RLS
* All ledger operations use service-role key or run inside Edge Functions.
* Client selects only from a view `v_user_ledger` filtered by `auth.uid()`.
* No client can directly insert/update ledger rows.

## 8  Estimating Task Cost
`estimateCost(task)` returns cost in cents and can depend on:
* tool (`image-generation`, `video-travel`, …)
* resolution, frame count, model type

Example costs:
* Single image generation: $0.10 (10 cents)
* Video generation: $0.50 base + $0.02 per frame (50 cents + 2 cents per frame)
* Image upscaling: $0.20 (20 cents)

The mapping lives inside the worker repo so it evolves alongside algorithms.

## 9  Implementation Plan
1. **DB Migration** – add `credits` column to `users`, create `credits_ledger`, trigger.
2. **Stripe Products** – define budget amounts; dynamic pricing instead of fixed SKUs.
3. **Edge Function** – Stripe webhook inserts ledger row.
4. **Worker Update** – wrap dequeue logic in transactional deduction.
5. **REST Layer** – expose balance & ledger endpoints for UI.
6. **React UI** –
   * Show remaining budget in header.
   * Checkout dialog with slider ($10-$100).
   * Ledger history table.
7. **Monitoring** – add Prometheus metric `budget_balance{user}` and alert on low budget.

## 10  Open Questions
* Multi-tenant accounts vs per-user balances?
* Grace budget (allow negative up to ‑$X)?
* Volume discounts / subscription tiers (combine recurring seats + pay-as-you-go budget)?
* Regional pricing for costly resources (GPU hours).

---
_© Reigh Architects, 2025_ 