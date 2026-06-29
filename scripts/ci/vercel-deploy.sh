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
  # Use the stable per-branch alias (redux-chat-git-<branch>-*.vercel.app) — the
  # URL users actually browse and that Vercel links in PR comments — NOT
  # VERCEL_URL, which is the per-deployment host (redux-chat-<hash>-*.vercel.app)
  # that changes every push. Better Auth's oAuthProxy uses SITE_URL as its
  # `currentURL`, so the whole OAuth round-trip — including the final
  # /oauth-proxy-callback that sets the session cookie — runs on this host. If it
  # is the per-deployment host, the cookie is set there and the closing 302 lands
  # the user back on the branch alias *without* the cookie (*.vercel.app is on the
  # public suffix list, so cookies are host-only) → silent bounce to sign-in,
  # never logged in.
  SITE_URL="${VERCEL_BRANCH_URL:-$VERCEL_URL}"
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
