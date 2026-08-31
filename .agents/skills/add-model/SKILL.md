---
name: add-model
description: Use when asked to add, register, expose, or support a new AI model, including requests like "Add Gemini 3.7 Flash". Refreshes the generated models.dev catalog, adds the curated model and provider routes, verifies capabilities and reasoning controls, and validates the live model when available.
---

# Add a model in one pass

Turn a short request such as “Add Gemini 3.7 Flash” into a complete, tested
model registration. Do not stop after adding a name to the selector: the
generated metadata, curated registry, route IDs, capabilities, and runtime
route must agree.

## Sources of truth

- `packages/models/scripts/generate-models.ts` controls the allowlisted
  models.dev snapshot and temporary upstream-data overrides.
- `packages/models/src/generated/*.ts` is generated metadata. Never edit it by
  hand.
- `packages/shared/src/models/curated/*.ts` controls which models the product
  exposes and how canonical models map to provider routes.
- `packages/shared/src/models/curated/index.ts` registers curated model makers.
- `packages/shared/src/models/registry.ts` resolves curated entries against the
  generated snapshot. A route ID that does not resolve is silently omitted.
- `packages/shared/src/models/route-behavior.ts` lists route providers the
  runtime knows how to use.

Use current generated metadata and official provider documentation as evidence.
Do not invent model IDs, availability, pricing, context limits, modalities, or
reasoning levels from the requested display name.

## Workflow

### 1. Refresh before editing

Use the repository-required Node and pnpm versions, then run:

```bash
pnpm models:generate
```

This fetches `https://models.dev/api.json` and rewrites every allowlisted
provider snapshot under `packages/models/src/generated`. Keep the generated
files changed by the refresh, including `manifest.ts`; review the diff for
unexpected deletions or malformed metadata.

Search the refreshed files for the requested model. Record:

1. the product's canonical ID: `<maker-slug>/<curated-model-id>`;
2. every usable route ID: `<route-provider>:<generated-model-key>`;
3. the preferred default route;
4. display name, attachment and output modalities, tool calling, structured
   output, reasoning, pricing, and context limits;
5. the exact user-selectable thinking levels, if any.

For example, a Google model may be exposed as
`google/gemini-3.7-flash` while its routes are
`vertex:gemini-3.7-flash` and
`openrouter:google/gemini-3.7-flash`. The maker slug and route provider are
different concepts.

Only include routes present in the refreshed generated catalogs and supported
by `ROUTE_PROVIDER_DEFAULTS`. Follow the existing maker's default-route
precedent, generally preferring its working first-party route over an
aggregator. Every `defaultProviderId` must also appear in `providerIds`.

### 2. Handle upstream catalog lag without fabricating data

If the model is absent after refresh, verify the exact API ID and metadata
against official, current provider documentation or a provider model-list API.
Use Context7 for library/provider docs when available; otherwise use first-party
documentation.

When the model is released and usable but models.dev is lagging, add a narrowly
scoped temporary record to `PROVIDER_MODEL_OVERRIDES` or
`OPENROUTER_MODEL_OVERRIDES` in
`packages/models/scripts/generate-models.ts`, following existing entries. Add
the override only when every required field is verified, then rerun
`pnpm models:generate`. Never place a guessed or manually edited record in
`src/generated`.

If the needed route provider is not allowlisted or has no runtime behavior,
supporting it is a provider integration, not merely a catalog entry. Complete
the generator allowlist/alias, package export, runtime provider, credentials,
route behavior, and tests before exposing the model. Do not add a curated entry
that resolves to zero routes.

### 3. Add the curated entry

Edit the existing maker file in
`packages/shared/src/models/curated/`. Match nearby ordering and conventions:

```ts
{
  id: "generated-or-product-facing-id",
  name: "Optional product display name",
  providerIds: [
    "aggregator:maker/provider-model-id",
    "first-party:provider-model-id",
  ],
  defaultProviderId: "first-party:provider-model-id",
  thinkingLevels: ["low", "medium", "high"],
},
```

- Omit `name` when the default route's generated display name is correct.
- Override `name` for a deliberate product alias or cleaner stable name.
- Do not infer controllable thinking levels from `reasoning: true`.
  `reasoning` means the model can reason, not that all UI levels work. Omit
  `thinkingLevels` only when the standard `instant`, `low`, `medium`, `high`
  set is verified; provide the exact supported subset otherwise; use `[]` when
  reasoning exists but the user cannot choose an effort level.
- Let catalog metadata drive ordinary capabilities. Use curated `capabilities`
  only for product behavior such as image output or image-generation-tool
  eligibility, following existing image model entries.
- Add `routeBehavior` or attachment overrides only when runtime/provider
  behavior requires them and evidence supports the difference.
- Do not change defaults or favorites unless the request explicitly asks for
  that product change.

If this is a new maker, create its curated file and import it into
`packages/shared/src/models/curated/index.ts`. Use the model's maker for the
curated provider, not necessarily the company hosting the route.

### 4. Validate the complete change

Run the affected-package checks:

```bash
pnpm -F @redux/models typecheck
pnpm -F @redux/shared typecheck
pnpm -F @redux/models lint
pnpm -F @redux/shared lint
pnpm -F @redux/models format
pnpm -F @redux/shared format
```

Inspect the final diff and confirm:

- generated files came from the generator and contain each curated route;
- no refreshed generated file was accidentally omitted;
- the canonical ID appears once in the curated registry;
- all route IDs resolve, the default route is among them, and the test observes
  the intended capabilities;
- unrelated defaults, favorites, and provider behavior did not change.

When provider credentials and local services are available, perform one live
smoke test: select the new model, send a short prompt, and verify a successful
response through the intended default route. For reasoning or multimodal
models, also exercise the newly claimed control or modality. Treat a catalog
entry as metadata evidence, not proof that the runtime route works.

## Completion standard

Finish with generated catalog updates, curated registration, a focused
diff review, all relevant checks passing, and a live smoke test when the
environment supports it. Report any unverified provider behavior explicitly;
never claim one-shot support based only on successful typechecking.
