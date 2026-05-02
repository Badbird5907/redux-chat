# Billing - Polar Only

This document describes the current billing model in `redux-chat`.

## TL;DR

- Polar is the single source of truth for subscriptions and credit balances.
- The app no longer stores local billing tables in Convex (`billingAccounts`, `billingUsageEvents`, `billingCreditGrants`, `billingBalanceCache` were removed).
- Chat requests are preflight-checked against Polar. If available credits are exhausted and overage is disabled, the API returns `402` with `{ error: "out_of_credits" }`.
- Usage is reported to Polar after generation via `credits` meter events.
- No pre-reservation is performed: users can start a generation with a small remaining balance.

## Runtime Flow

1. User submits a message.
2. `apps/tanstack-start/src/routes/api/chat/index.ts` fetches:
   - subscription snapshot (`api.functions.billing.getCurrentBillingState`)
   - live meter state (`api.functions.billing.refreshCurrentUserMeterState`)
3. If `availableCredits <= 0` and `overageAllowed === false`, request is rejected with `402`.
4. Otherwise generation runs.
5. On finish, `api.functions.billing.recordUsageEvent` computes charge and ingests the usage event to Polar.

## Convex Billing Functions

`packages/backend/convex/functions/billing.ts` now keeps only Polar-backed behavior:

- `getCurrentBillingState` - subscription/tier metadata only (no local balance cache reads).
- `refreshCurrentUserMeterState` - live balance check against Polar (`customers.getStateExternal`).
- `recordUsageEvent` - usage charge calculation + Polar event ingest.
- `ensureCurrentUserPolarCustomer` - customer creation/reconciliation + best-effort free product auto-subscription.

## Why No Redis For Billing

Redis remains in use for resumable streams and attachment derivative caches, but not for billing balance state.

Billing balance is authoritative in Polar; introducing Redis here would add another stale cache layer and invalidation complexity without changing correctness.

If Polar latency ever becomes a proven bottleneck, add a short-lived server TTL cache as an optimization only.

## Polar Dashboard Requirements

Ensure these are configured:

- Products mapped to `free`, `plus`, `pro`.
- `meter_credit` benefits attached per product with monthly grants.
- Credits meter name matches `POLAR_CREDITS_METER_NAME` (default `Credit Usage`).
- Webhook route registered (`/polar/events`) via `polar.registerRoutes(http)`.

## Environment

Backend requires:

- `POLAR_ACCESS_TOKEN`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_SERVER`
- `POLAR_CREDITS_METER_NAME`
- `POLAR_FREE_PRODUCT_ID`
- `POLAR_PLUS_PRODUCT_ID`
- `POLAR_PRO_PRODUCT_ID`
<!--
# Billing — Polar + Credits

This document describes how billing works in redux-chat after the Polar
migration, what each piece of code does, and what you (the operator) need to
configure in the Polar dashboard for it to actually run.

---

## TL;DR

- Polar is the **source of truth** for both subscription tier and credit
  balance.
- Three tiers: **Free** (25,000 credits/mo), **Plus** (250,000 credits/mo, 1.5×
  markup), **Pro** (1,000,000 credits/mo, 1.25× markup). 1 credit = $0.000005
  of effective usage.
- Each tier corresponds to a **Polar product**. A `meter_credit` benefit
  attached to each product auto-grants the included credits at the start of
  every subscription cycle.
- Usage (chat generations, tool calls) is reported to a **single Polar meter**
  named `Credit Usage` (configurable) by ingesting events with positive
  `metadata.units`.
- Available credits = `creditedUnits − consumedUnits` from the meter
  (`balance` field). **Positive = available**, **negative = overage**.
- Free users are auto-subscribed to the required $0 Polar product configured by
  `POLAR_FREE_PRODUCT_ID`.

---

## What changed in this migration

The codebase previously used the legacy "ingest negative units yourself"
pattern (Pattern A) where granting credits meant ingesting an event with
`units: -N` and the meter's running sum encoded the balance with negative =
available. That pattern is incompatible with Polar's modern `meter_credit`
benefit, which only accepts positive credit grants. This migration moves the
project onto the benefit pattern (Pattern B) and is sign-correct under both
patterns so the cutover doesn't have to be atomic with dashboard config.

### Code changes shipped in this branch

1. **Sign-convention-agnostic meter extraction**
   `packages/backend/convex/billing.ts` — `extractMeterCreditSummary` /
   `deriveMeterCreditSummary` now compute `balance = creditedUnits − consumedUnits`
   (or trust `meter.balance` if returned). Positive balance ⇒ available credits;
   negative ⇒ overage. Works whether grants come from `meter_credit` benefits
   (Pattern B) or legacy negative-units ingest (Pattern A).
2. **Paid-tier monthly grants delegated to Polar**
   `packages/backend/convex/functions/billing.ts` — `ensureMonthlyCreditsForUser`
   now early-returns for `plus` and `pro` tiers. Polar's `meter_credit`
   benefit handles paid-tier renewals; we no longer ingest manual grants for
   them.
3. **Lazy grant call removed from the chat hot path**
   `recordUsageEvent` no longer calls `ensureMonthlyCreditsForUser`. Usage
   events only ingest usage. Grants happen via Polar (paid) or via explicit
   refresh / cron (free).
4. **Free tier becomes a required Polar product**
   - Required env var `POLAR_FREE_PRODUCT_ID` (`packages/backend/convex/env.ts`).
   - Registered in `packages/backend/convex/polar.ts` `products` map under
     key `free`.
   - `resolveTierFromSubscription` recognizes the free product
     (`packages/backend/convex/billing.ts`).
   - `ensurePolarCustomerForCurrentUser` auto-subscribes new users to it.
   - `ensureMonthlyCreditsForUser` early-returns for `free` too — Polar's
     benefit handles everything.
5. **Cancel / revoke webhook handlers**
   `packages/backend/convex/http.ts` — added `subscription.canceled` and
   `subscription.revoked` handlers that call a new
   `internal_markSubscriptionEnded` mutation, which reverts the user's local
   tier to `"free"`. Next call to `ensurePolarCustomerForCurrentUser` will
   re-subscribe them to the free product.
6. **Backend pre-flight credit gate on `/api/chat`**
   `apps/tanstack-start/src/routes/api/chat/index.ts` now reads
   `getCurrentBillingState` (a pure DB query against `billingBalanceCache`)
   first and only refreshes from Polar if the cache is missing or older than
   60s. Returns HTTP **402** with body
   `{ error: "out_of_credits", tier, availableCredits }` when out of credits
   and overage isn't allowed.
7. **Frontend surfaces 402**
   `apps/tanstack-start/src/components/chat/use-chat-session.ts` `onError`
   detects `out_of_credits` in the error payload, shows a toast, and forces a
   refresh of the cached billing state so the input gates re-render.
8. **`_cost.amount` cents fix**
   `packages/backend/convex/billing.ts` — `_cost.amount` is now passed in
   integer cents (with sub-cent decimal precision), not dollars. Fixes the
   100× off-by-one in Polar's Cost Insights dashboard.
9. **Settings page no longer self-heals**
   `apps/tanstack-start/src/routes/settings/index.tsx` — removed the
   `useEffect` that lazily called `grantMonthlyCreditsForCurrentUserIfNeeded`
   on render. Manual "Refresh Credits" button is the only Polar-touching path.
10. **Dead code cleanup**
    - Deleted alias actions `grantMonthlyCreditsForCurrentUserIfNeeded`,
      `syncSubscriptionTierAndCredits` (both wrapped `refreshBillingStateForUser`).
    - Deleted helpers `getGrantReason`, `getGrantSource`,
      `internal_hasAnyCreditGrantForTier`.

---

## What you need to do in the Polar dashboard

Do these once per environment (sandbox first; verify; then production).

### 1. Create / verify the credit usage meter

Path: **Polar dashboard → Meters → New meter** (or open the existing one).

| Field | Value |
| --- | --- |
| Display name | `Credit Usage` (must match `POLAR_CREDITS_METER_NAME` in your `.env`) |
| Filter | Event `name` equals `credits` |
| Aggregation | **Sum** of `metadata.units` |

⚠️ If the filter doesn't match the event name `credits`, every usage event
this app ingests is silently dropped. Confirm with one test ingest before
moving on.

### 2. Attach `meter_credit` benefits to Plus and Pro

Path: **Products → (Plus product) → Benefits → Add benefit → Meter Credits**.

| Product | Credits / cycle | Cycle | Meter |
| --- | --- | --- | --- |
| Plus | **250000** | Monthly | `Credit Usage` |
| Pro | **1000000** | Monthly | `Credit Usage` |

Save. Polar will now auto-grant these credits at every renewal.

### 3. Create a $0 Free product (recommended)

Path: **Products → New product**.

| Field | Value |
| --- | --- |
| Name | Free |
| Pricing | $0 / month (recurring) |
| Meter Credits benefit | **25000** units / monthly cycle on `Credit Usage` |

Copy the resulting product ID into `POLAR_FREE_PRODUCT_ID` in your `.env`. The
app requires this value, auto-subscribes every new user to the free product on
their first authenticated billing call, and uses Polar as the source of truth
for free credits too.

### 4. Webhook configuration

Make sure the Polar webhook (the one signing requests with
`POLAR_WEBHOOK_SECRET`) is subscribed to **all four** of these events:

- `subscription.created`
- `subscription.updated`
- `subscription.canceled` ← **new — required for cancel handling**
- `subscription.revoked` ← **new — required for revoke handling**

Endpoint URL stays the same (`<convex-site-url>/polar/events`); the routes are
registered by `polar.registerRoutes(http, ...)` in
`packages/backend/convex/http.ts`.

### 5. Update environment variables

Add to `.env` and `.env.prod` (sandbox/production respectively):

```env
# Required $0 Free product.
POLAR_FREE_PRODUCT_ID="<the Free product UUID from step 3>"

# Existing — verify these are still correct.
POLAR_PLUS_PRODUCT_ID="..."
POLAR_PRO_PRODUCT_ID="..."
POLAR_CREDITS_METER_NAME="Credit Usage"
POLAR_ACCESS_TOKEN="..."
POLAR_WEBHOOK_SECRET="..."
POLAR_SERVER="sandbox"  # or "production"
```

If you deploy to Convex, also set `POLAR_FREE_PRODUCT_ID` in the Convex
dashboard under the deployment's Environment Variables.

### 6. Existing-user reconciliation (sandbox)

If your sandbox already has test users whose meters are in the legacy Pattern
A state (i.e., `consumedUnits` is negative because we used to ingest
`units: -N` grants), the app's new code is sign-agnostic and will read those
correctly. But once you attach the `meter_credit` benefits in step 2, the
benefit grants will *add* to those negative `consumedUnits` values, possibly
producing inflated balances on the next renewal.

**Easiest path** for sandbox: delete the existing test customers in Polar and
sign up fresh through the app, which triggers `ensurePolarCustomerForCurrentUser`
to create them anew. The app will then receive its first benefit grant cleanly.

For production (if you have real users when you do this migration), open a
one-shot internal script that, for each customer:
1. Reads `polarSdk.customers.getStateExternal({ externalId })`.
2. If `consumedUnits < 0`, ingests an event `{ name: "credits", externalCustomerId, metadata: { units: -consumedUnits } }`
   to bring `consumedUnits` to 0 without touching balance perception (this is
   a forward usage event; the negative-grants residual cancels out under the
   new pattern's math).
3. Then attach the `meter_credit` benefits in the dashboard.

---

## How the system behaves at runtime

### Free-tier signup

1. User signs in for the first time.
2. First chat or settings page visit triggers `ensurePolarCustomerForCurrentUser`.
3. App creates a Polar customer with `externalId = userId`.
4. App calls `polarSdk.subscriptions.create` with the free product. Polar
   immediately credits the meter with 25,000 units via the `meter_credit`
   benefit.
5. `refreshBillingStateForUser` reads `getStateExternal`, sees
   `creditedUnits = 25000`, `consumedUnits = 0`, `balance = 25000`, writes
   that to `billingBalanceCache`.
6. Settings page and chat-input gate render `availableCredits = 25000`.

### Plus / Pro upgrade

1. User goes through Polar checkout for the Plus or Pro product.
2. Polar's webhook fires `subscription.created`. Our handler updates
   `billingAccounts.tier` to `"plus"` (or `"pro"`).
3. Polar's `meter_credit` benefit grants 250k (or 1M) credits to the meter
   automatically — the app does **not** ingest a manual grant.
4. Next chat sends a usage event (positive `metadata.units`); meter
   `consumedUnits` increments; `balance = credited − consumed` decreases.

### Generation / tool call

1. Frontend chat input checks the cached `isOutOfCredits` flag — disables
   send if true.
2. Backend `/api/chat`:
   - Reads `getCurrentBillingState` (DB query, no Polar round-trip).
   - If `syncedAt` is missing or older than 60s, calls
     `refreshCurrentUserMeterState` to repopulate.
   - If `availableCredits <= 0 && !overageAllowed`, returns 402
     `{ error: "out_of_credits", ... }`.
3. Generation runs.
4. `onFinish` calls `recordUsageEvent` which:
   - Computes `charge` (USD → credits with tier markup).
   - Inserts a row into `billingUsageEvents`.
   - Ingests a Polar event named `credits` with positive
     `metadata.units = charge.credits` and a `_cost` insight payload in cents.
   - Calls `refreshBillingStateForUser` to update the cache.

### Subscription cancel / revoke

1. Polar webhook fires `subscription.canceled` or `subscription.revoked`.
2. `internal_markSubscriptionEnded` reverts `billingAccounts.tier` to `"free"`,
   clears period dates, resets markup/included credits to free defaults.
3. Next call to `ensurePolarCustomerForCurrentUser` checks for an active
   subscription; finding none, auto-subscribes them to the free product,
   restoring 25k credits.

### Monthly renewal

- **Paid (plus, pro)**: Polar fires `subscription.updated` and the
  `meter_credit` benefit grants the cycle's credits. App syncs
  `billingAccounts` from the webhook. No manual ingest needed.
- **Free**: Same as paid but on the required free product.

---

## Verification checklist (sandbox)

Run all of these before promoting to production.

- [ ] Meter exists with filter `name == "credits"`, Sum on `metadata.units`,
      display name matching `POLAR_CREDITS_METER_NAME`.
- [ ] Plus / Pro / Free products each have a `meter_credit` benefit with the
      correct unit count and monthly cycle.
- [ ] All four subscription webhook events are subscribed.
- [ ] Fresh signup as Free → 25k visible in settings within ~5s. Send chat
      messages until 0; confirm `/api/chat` returns 402 with
      `{ error: "out_of_credits" }`.
- [ ] Upgrade Free → Plus via Polar checkout. Within ~5s, settings show 250k.
      Polar dashboard "Events" tab for that customer should show **only**
      positive-unit usage events from your backend (no negative-unit grants).
- [ ] In the Polar dashboard, advance the subscription one cycle (or manually
      trigger renewal). After `refresh`, balance is back to 250k exactly.
- [ ] Cancel the Plus subscription. Settings show Free, 25k available, after
      next refresh.
- [ ] Resend a `subscription.created` webhook from the Polar dashboard. The
      app should patch `billingAccounts` in place; Polar dashboard's customer
      meter should not show a new grant on top.
- [ ] In Polar, check the customer's Cost Insights — per-event amounts should
      be in the cents range you expect (a small chat is typically a fraction
      of a cent up to a few cents). If you see values 100× off in either
      direction, something's wrong with the cents conversion.

---

## Files of interest

| Path | Role |
| --- | --- |
| `packages/backend/convex/billing.ts` | Polar SDK client, event builders, meter extraction |
| `packages/backend/convex/functions/billing.ts` | Actions, mutations, queries; usage recording; customer/subscription lifecycle |
| `packages/backend/convex/polar.ts` | `@convex-dev/polar` instance + product registration |
| `packages/backend/convex/http.ts` | Webhook handlers |
| `packages/backend/convex/env.ts` | Env-var validation |
| `packages/backend/convex/schema.ts` | `billingAccounts`, `billingUsageEvents`, `billingCreditGrants`, `billingBalanceCache` |
| `packages/shared/src/billing.ts` | Tier definitions, `calculateUsageCharge`, credit/USD math |
| `apps/tanstack-start/src/routes/api/chat/index.ts` | Chat handler with pre-flight 402 gate and `recordUsageEvent` call |
| `apps/tanstack-start/src/components/chat/use-billing-state.ts` | Reactive billing state hook |
| `apps/tanstack-start/src/components/chat/use-chat-session.ts` | Surfaces backend 402 to user |
| `apps/tanstack-start/src/routes/settings/index.tsx` | Credits UI + manual refresh |

---

## Things explicitly out of scope for this pass

- **Multi-bucket credits** (gifted / monthly / purchased with priority spend).
  Doable in Polar via three meters + an in-app allocator, but adds significant
  complexity and is deferred to V2. Note placeholder `// TODO: bucket allocator`
  could be added later in `recordUsageEvent`.
- **Credit-pack one-time purchases.** Same as above — defer until product
  demand exists.
- **Server-side mutex for concurrent charges.** Not needed for single-bucket;
  becomes important if multi-bucket is added.
- **Schema-level deletion of `billingCreditGrants`.** The table still exists
  for admin adjustment audit rows. Dropping or reshaping it can happen in a
  follow-up if admin reset auditing moves elsewhere.

---

## Debugging

- Set `BILLING_DEBUG_LOGGING = true` at the top of
  `packages/backend/convex/billing.ts` to enable detailed structured logs
  from `recordUsageEvent`, `refreshBillingStateForUser`, and the meter
  extraction code.
- Search Convex logs for `billing_extract_meter_balance_match` to see what
  Polar returns for `consumedUnits` / `creditedUnits` / `balance` and the
  derived `availableCredits` / `overageCredits`.
- Search for `billing_record_usage_checkpoint` to trace the usage-event hot
  path from request through Polar ingest.
