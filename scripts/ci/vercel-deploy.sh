#!/bin/bash
set -euo pipefail

export NITRO_PRESET=vercel

pushd ./packages/backend
# Build the frontend against the Convex deployment we are deploying to (the
# per-preview deployment for previews, production for prod) instead of whatever
# VITE_CONVEX_URL Vercel has baked in. Convex injects the deployment's cloud URL
# as VITE_CONVEX_URL; derive the matching .site URL for Better Auth from it.
# Without this, preview frontends talk to the production Convex backend, which
# disables the Better Auth oAuthProxy and breaks OAuth (state_mismatch).
pnpm run convex deploy \
  --cmd-url-env-var-name VITE_CONVEX_URL \
  --cmd 'VITE_CONVEX_SITE_URL="${VITE_CONVEX_URL%.cloud}.site" pnpm run build:app'
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
# Sync INTERNAL_CONVEX_SECRET so the Convex preview deployment verifies HMAC
# signatures with the same key the Vercel frontend used to sign them. Preview
# deployments inherit env vars from production at creation time and can go stale
# if the secret is later rotated or was set independently on each platform.
if [[ "${VERCEL_ENV:-}" != "production" && -n "${INTERNAL_CONVEX_SECRET:-}" ]]; then
  pnpm run convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" INTERNAL_CONVEX_SECRET "$INTERNAL_CONVEX_SECRET"
fi
popd

if [[ -d apps/tanstack-start/.vercel/output ]]; then
  rm -rf .vercel/output
  mkdir -p .vercel
  cp -R apps/tanstack-start/.vercel/output .vercel/output
elif [[ ! -d .vercel/output ]]; then
  echo "Expected Vercel build output at .vercel/output or apps/tanstack-start/.vercel/output"
  exit 1
fi
