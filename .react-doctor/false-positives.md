# React Doctor — known false positives

Patterns the agent should drop during Step 2 filtering, with rationale.

## `deslop/unused-file`

**Suppressed globally** via `react-doctor.config.json` in every workspace package (`packages/ui`, `packages/email`, `apps/tanstack-start`). Reason: the detector does not resolve

1. **Workspace-package consumers** — files in `packages/ui` and `packages/email` are reached from the app only via `@redux/ui/components/*` and `@redux/email` package-exports paths (declared in each package's `"exports"` map). The detector treats every file in those packages as unreachable.
2. **TypeScript path aliases** — `apps/tanstack-start` uses `@/*` → `./src/*` (declared in `tsconfig.json` paths). The detector does not follow this alias, so any file imported only via `@/...` (the project's convention) shows as unused — even when there is a clean chain back to a route entry point (verified e.g. for `src/components/sidebar/index.tsx` → `app-sidebar-panel` → `routes/_app.tsx`).

How to re-enable safely: ship deslop support for `tsconfig.json` paths and workspace-exports resolution, then delete the `rules` override in each `react-doctor.config.json`.

## `react-doctor/no-event-handler` — open follow-up

10 occurrences across `use-chat-draft.ts`, `use-chat-session.ts`, and `shiki-code-block.tsx` are intentionally left unsuppressed. Each needs a per-site judgment call (some fire on `useMemo` / `useStableInitialValue` initializers rather than `useEffect`, so the validation prompt's framing doesn't directly apply). To be triaged in a follow-up PR alongside the giant-component refactors.
