#!/bin/bash
set -e

pushd ./packages/backend
pnpm run convex deploy --cmd "pnpm run build:app"
pnpm run convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" SITE_URL "$VERCEL_URL"
popd

rm -rf .vercel/output
mkdir -p .vercel
cp -R apps/tanstack-start/.vercel/output .vercel/output
