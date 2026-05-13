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
   changes.
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
| `paid`    | One-time Stripe purchases                     | Long-lived     |
| `gifted`  | Admin or promotional grants                   | Grant-specific |

Allocation consumes lower-priority buckets first so expiring or promotional
credits are spent before purchased credits.

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
```

## Key Files

| File                                           | Responsibility                         |
| ---------------------------------------------- | -------------------------------------- |
| `packages/backend/convex/functions/billing.ts` | Billing actions and queries            |
| `packages/backend/convex/stripe.ts`            | Stripe clients and price helpers       |
| `packages/backend/convex/billing.ts`           | Subscription normalization helpers     |
| `packages/backend/convex/credits.ts`           | Credit ledger allocation and balance   |
| `packages/backend/convex/http.ts`              | Stripe webhook handling                |
| `packages/shared/src/billing.ts`               | Plan and usage charge configuration    |
