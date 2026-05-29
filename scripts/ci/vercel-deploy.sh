#!/bin/bash
set -euo pipefail

pushd ./packages/backend
pnpm run convex deploy --cmd "pnpm run build:app"
SITE_URL="$VERCEL_URL"
case "$SITE_URL" in
  http://* | https://*) ;;
  *) SITE_URL="https://$SITE_URL" ;;
esac
pnpm run convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" SITE_URL "$SITE_URL"
popd

rm -rf .vercel/output
mkdir -p .vercel
cp -R apps/tanstack-start/.vercel/output .vercel/output
