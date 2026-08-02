# Billing

Redux Chat uses Stripe for customers, subscriptions, checkout, customer portal,
and webhooks. Credit balances are authoritative in Convex.

## Runtime Flow

1. Authenticated app startup ensures the user has a Stripe customer
   (`api.functions.billing.ensureCurrentUserStripeCustomer`).
2. Billing reads use `api.functions.billing.getCurrentBillingState`.
3. Chat preflight calls `api.functions.billing.refreshCurrentUserBillingState`.
   This action resolves the current Stripe subscription, idempotently grants
   free monthly credits when needed, reads the Convex credit ledger, and fetches
   live Stripe schedule details such as cancel-at-period-end and pending price
   changes. When preview billing simulation is active it uses the simulated tier
   and does not fetch Stripe customer, schedule, or payment-method state.
4. If `spendableCredits <= 0` and overage is disabled, chat returns `402` with
   `{ error: "out_of_credits" }`.
5. On generation finish, `api.functions.billing.recordUsageEvent` debits the
   Convex ledger.

## Source Of Truth

- Convex credit grants and debits determine spendable balance.
- Stripe determines subscription tier, checkout, billing portal access, and
  subscription schedule state.

## Credit Sources

Credits are stored in Convex buckets:

| Bucket    | Source                                        | Expiration     |
| --------- | --------------------------------------------- | -------------- |
| `monthly` | Free monthly resets and subscription renewals | Period end     |
| `monthly` | Preview/local billing simulation              | Period end     |
| `paid`    | One-time Stripe purchases                     | Long-lived     |
| `gifted`  | Admin or promotional grants                   | Grant-specific |

Allocation consumes lower-priority buckets first so expiring or promotional
credits are spent before purchased credits.

## Checkout and Portal Reconciliation

Stripe webhooks remain the production source of truth, but Settings also has an
idempotent repair path so ephemeral previews do not need their own webhook
destination:

- Subscription Checkout returns to
  `/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`.
- The callback validates the completed subscription Checkout Session, its user
  metadata, Stripe customer, configured price, and active/trialing subscription
  before synchronizing Convex state and monthly credits.
- The customer portal returns to `/settings?billingPortal=return`, which lists
  the current customer's subscriptions and selects the highest configured active
  tier, using the newest subscription to break ties.
- Reloads and retries are safe. Checkout Session, subscription, invoice, and
  credit writes are idempotent.

Credit top-up and promotional Checkout callbacks are not reconciled by the
Settings subscription callback.

## Preview Billing Simulator

Set `BILLING_SIMULATION_ENABLED=true` on the Convex deployment to expose the
simulator. The backend still rejects it unless `SITE_URL` is either an HTTP
localhost origin (`localhost`, `127.0.0.1`, or `::1`) or an HTTPS
`*.vercel.app` origin. Custom domains, including production, remain ineligible
even if the flag is set accidentally.

An authenticated user can simulate Plus or Pro for only their own account. The
override and its distinct `billing_simulation` monthly credit grant expire at
the end of the current UTC month. A real active/trialing Stripe subscription
blocks activation. While simulation is active, Stripe billing controls and
Stripe-backed promotions are unavailable until the user resets simulation;
ordinary app-credit promotions continue to work.

Configure `BILLING_SIMULATION_ENABLED=true` in Vercel's Preview environment.
The deploy script copies the value to the branch's Convex preview and removes a
stale preview value when the flag is disabled. It never enables simulation on a
production deployment.

## Promotions

Promotions are redeemed through Redux Chat codes at `/redeem/<code>`; Stripe
hosted promotion codes are not used. The redemption action reserves a Convex
usage row first, then applies the benefit and records every attempt for admin
tracking.

- App credit promotions grant Convex `gifted` credit buckets.
- Subscription discount promotions create Stripe Coupons internally. Partial
  discounts send the user to Stripe Checkout; gifted or 100% discount
  subscriptions create the Stripe subscription directly without requiring a
  payment method.
- Stripe invoice credit promotions use Stripe Customer Balance Transactions.
  Credits are written as negative customer balance transactions. Revoking one
  creates an offsetting positive transaction and marks the usage row revoked.

## Stripe Dashboard Requirements

- Recurring prices exist for Plus and Pro and match:
  - `STRIPE_PLUS_PRICE_ID`
  - `STRIPE_PRO_PRICE_ID`
- Stripe webhook route points at `<convex-site-url>/stripe/webhook`.
- Webhook secret matches `STRIPE_WEBHOOK_SECRET`.
- Webhook endpoint includes:
  - `checkout.session.completed`
  - `customer.created`
  - `customer.updated`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.created`
  - `invoice.finalized`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
- Dynamic credit top-ups use `STRIPE_CREDIT_TOP_UP_PRODUCT_ID`, a Stripe product
  whose checkout price is supplied per session by Redux Chat.

## Required Environment

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PLUS_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_CREDIT_TOP_UP_PRODUCT_ID=
BILLING_SIMULATION_ENABLED=false
```

## Key Files

| File                                                | Responsibility                         |
| --------------------------------------------------- | -------------------------------------- |
| `packages/backend/convex/functions/billing.ts`      | Billing actions and queries            |
| `packages/backend/convex/stripe.ts`                 | Stripe clients and price helpers       |
| `packages/backend/convex/billing.ts`                | Subscription normalization helpers     |
| `packages/backend/convex/billingSimulation.ts`      | Preview/local simulation security gate |
| `packages/backend/convex/credits.ts`                | Credit ledger allocation and balance   |
| `packages/backend/convex/http.ts`                   | Stripe webhook handling                |
| `packages/backend/convex/stripeSubscriptionSync.ts` | Shared subscription synchronization    |
| `packages/shared/src/billing.ts`                    | Plan and usage charge configuration    |
