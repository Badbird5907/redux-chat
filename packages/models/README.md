# @redux/models

Static, tree-shakable model metadata sourced from [models.dev](https://models.dev/).

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

Import a provider subpath when you only need a single provider catalog:

```ts
import { openaiModels } from "@redux/models/openai";
```

Import the root entry point for shared helpers:

```ts
import { calculateModelCost, getModelSpec } from "@redux/models";
```
