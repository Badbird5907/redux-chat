# Billing

Redux Chat uses Polar for customers, subscriptions, checkout, customer portal,
webhooks, and cost-event analytics. Credit balances are authoritative in Convex.

## Runtime Flow

1. Authenticated app startup ensures the user has a Polar customer
   (`api.functions.billing.ensureCurrentUserPolarCustomer`).
2. Billing reads use `api.functions.billing.getCurrentBillingState`.
3. Chat preflight calls `api.functions.billing.refreshCurrentUserBillingState`.
   This action:
   - resolves the current Polar subscription,
   - idempotently grants free monthly credits when needed,
   - reads the Convex credit ledger,
   - optionally fetches live Polar subscription schedule details such as
     cancel-at-period-end and pending product changes.
4. If `spendableCredits <= 0` and overage is disabled, chat returns `402` with
   `{ error: "out_of_credits" }`.
5. On generation finish, `api.functions.billing.recordUsageEvent` debits the
   Convex ledger and best-effort ingests a Polar `credits` event for Cost
   Insights analytics.

## Source Of Truth

- Convex credit grants and debits determine spendable balance.
- Polar determines subscription tier, checkout, billing portal access, and
  subscription schedule state.
- Polar cost events are analytics only. A failed Polar event ingest does not
  block a successful Convex debit.

## Credit Sources

Credits are stored in Convex buckets:

| Bucket | Source | Expiration |
| --- | --- | --- |
| `monthly` | Free monthly resets and subscription renewals | Period end |
| `paid` | One-time Polar purchases | Long-lived |
| `gifted` | Admin or promotional grants | Grant-specific |

Allocation consumes lower-priority buckets first so expiring or promotional
credits are spent before purchased credits.

## Polar Dashboard Requirements

- Products exist for Plus and Pro and match:
  - `POLAR_PLUS_PRODUCT_ID`
  - `POLAR_PRO_PRODUCT_ID`
- Polar webhook route points at `<convex-site-url>/polar/events`.
- Webhook secret matches `POLAR_WEBHOOK_SECRET`.
- One-time credit products include a `credits` metadata value when they should
  grant purchased credits.
- Do not configure Polar credit grants for the Free product; Free credits are
  granted by the Convex ledger.

## Required Environment

```bash
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
POLAR_SERVER="sandbox" # or "production"
POLAR_PLUS_PRODUCT_ID=
POLAR_PRO_PRODUCT_ID=
```

## Key Files

| File | Responsibility |
| --- | --- |
| `packages/backend/convex/functions/billing.ts` | Billing actions and queries |
| `packages/backend/convex/billing.ts` | Polar SDK client, subscription helpers, event builders |
| `packages/backend/convex/credits.ts` | Credit ledger allocation and balance logic |
| `packages/backend/convex/http.ts` | Polar webhook handling |
| `packages/shared/src/billing.ts` | Plan and usage charge configuration |
