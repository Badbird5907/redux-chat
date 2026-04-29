# @redux/models

Static model metadata sourced from [models.dev](https://models.dev/).

## What it provides

- provider catalogs for the allowlisted providers we care about
- helpers for looking up model specs by route id
- cost calculation utilities for token/audio usage
- generated snapshots committed into the repo so app builds do not depend on network fetches

## Update the snapshot

```sh
pnpm models:generate
```

This runs `packages/models/scripts/generate-models.ts`, fetches the latest
`https://models.dev/api.json`, filters it to the provider allowlist, and writes
the generated provider modules under `src/generated`.

## Tree-shaking

The package is configured with `"sideEffects": false`, so bundlers can remove
unused exports and unused provider modules.

What is tree-shakable today:

- importing helpers like `calculateModelCost` does not pull provider catalogs
- importing a provider subpath like `@redux/models/openai` only pulls that
  provider's catalog

What is **not** tree-shakable today:

- individual models inside a provider catalog are emitted as one object literal,
  so importing `anthropicModels` includes the whole Anthropic catalog in the
  bundle

If we want per-model tree-shaking, we should change generation to emit one
export per model (or one file per model) instead of one giant provider object.

Import a provider subpath when you only need a single provider catalog:

```ts
import { openaiModels } from "@redux/models/openai";
```

Import the root entry point for shared helpers:

```ts
import { calculateModelCost, getModelSpec } from "@redux/models";
```
