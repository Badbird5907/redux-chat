<wizard-report>
# PostHog post-wizard report

The wizard has completed a full PostHog integration for Redux Chat, a TanStack Start full-stack AI chat application. The integration covers client-side analytics, server-side event capture, user identification, and a reverse-proxy configuration. `posthog-js` and `posthog-node` were installed, `PostHogProvider` was added to the root route, and 10 events were instrumented across 10 files.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User created an account via email/password | `src/routes/auth.sign-up.tsx` |
| `user_signed_in` | User signed in via email/password | `src/routes/auth.sign-in.tsx` |
| `message_sent` | User submitted a chat message (includes model, thread context, attachment count) | `src/components/chat/input/index.tsx` |
| `model_changed` | User selected a different AI model from the picker | `src/components/chat/model-selector/use-model-selector-state.ts` |
| `project_created` | User created a new project | `src/components/projects/new-project-dialog.tsx` |
| `share_link_created` | User created a public share link for a thread | `src/components/share/thread-share-dialog.tsx` |
| `credits_checkout_started` | User initiated a credit top-up checkout (includes amount and tier) | `src/components/billing/add-credits-dialog.tsx` |
| `promotion_redeemed` | User redeemed a promotion code | `src/routes/redeem.$code.tsx` |
| `chat_stream_completed` | Server: chat generation finished (includes model, token usage, timing) | `src/routes/api/chat/index.ts` |
| `out_of_credits` | Server: chat request blocked due to insufficient credits | `src/routes/api/chat/index.ts` |

User identification (`posthog.identify`) fires on both sign-up and sign-in with the user's email as the distinct ID.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](/dashboard/1638267)
- [New Signups Over Time](/insights/2sCPrruz) — daily sign-up trend
- [Daily Messages Sent](/insights/6RjumdUZ) — overall chat activity
- [Model Usage Breakdown](/insights/GCWkzzkj) — which models users prefer
- [Sign-up to First Message Funnel](/insights/J09OX3xJ) — activation conversion rate
- [Credits Checkout Started vs Out of Credits](/insights/JC0rZbWt) — billing pressure signals

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-tanstack-start/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
