#!/bin/bash
set -euo pipefail
trap 'popd' EXIT

pushd ./packages/backend
pnpm run convex deploy --cmd "pnpm run build:app"
SITE_URL="$VERCEL_URL"
if [[ "$SITE_URL" != http://* && "$SITE_URL" != https://* ]]; then
  SITE_URL="https://$SITE_URL"
fi
pnpm run convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" SITE_URL "$SITE_URL"
popd

rm -rf .vercel/output
mkdir -p .vercel
cp -R apps/tanstack-start/.vercel/output .vercel/output
