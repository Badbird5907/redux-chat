#!/bin/bash
set -euo pipefail

export NITRO_PRESET=vercel

pushd ./packages/backend
pnpm run convex deploy --cmd "pnpm run build:app"
if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  SITE_URL="redux.chat"
else
  SITE_URL="$VERCEL_URL"
fi
case "$SITE_URL" in
  http://* | https://*) ;;
  *) SITE_URL="https://$SITE_URL" ;;
esac
pnpm run convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" SITE_URL "$SITE_URL"
popd

if [[ -d apps/tanstack-start/.vercel/output ]]; then
  rm -rf .vercel/output
  mkdir -p .vercel
  cp -R apps/tanstack-start/.vercel/output .vercel/output
elif [[ ! -d .vercel/output ]]; then
  echo "Expected Vercel build output at .vercel/output or apps/tanstack-start/.vercel/output"
  exit 1
fi
