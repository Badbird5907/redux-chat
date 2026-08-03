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
run_convex_deploy() {
  pnpm run convex deploy "$@" \
    --cmd-url-env-var-name VITE_CONVEX_URL \
    --cmd 'VITE_CONVEX_SITE_URL="${VITE_CONVEX_URL%.cloud}.site" pnpm run build:app'
}

if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
  # Preserve branch-preview data across normal commits. If persisted data is
  # incompatible with a deliberately breaking schema change, retry once with a
  # fresh deployment. Do not erase data for build, network, or other failures.
  deploy_log="$(mktemp)"
  trap 'rm -f "$deploy_log"' EXIT

  set +e
  run_convex_deploy \
    --preview-name "$VERCEL_GIT_COMMIT_REF" 2>&1 | tee "$deploy_log"
  deploy_pipeline_status=("${PIPESTATUS[@]}")
  set -e
  deploy_status=${deploy_pipeline_status[0]}
  tee_status=${deploy_pipeline_status[1]}

  if ((tee_status != 0)); then
    exit "$tee_status"
  fi

  if ((deploy_status != 0)); then
    if grep -Fq "Schema validation failed" "$deploy_log"; then
      echo "Convex preview data does not match the new schema; recreating the preview deployment."
      run_convex_deploy --preview-create "$VERCEL_GIT_COMMIT_REF"
    else
      exit "$deploy_status"
    fi
  fi

  rm -f "$deploy_log"
  trap - EXIT
else
  run_convex_deploy
fi
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
if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  pnpm run convex env set SITE_URL "$SITE_URL"
else
  pnpm run convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" SITE_URL "$SITE_URL"
  if [[ "${BILLING_SIMULATION_ENABLED:-false}" == "true" ]]; then
    pnpm run convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" BILLING_SIMULATION_ENABLED true
  else
    pnpm run convex env remove --preview-name "$VERCEL_GIT_COMMIT_REF" BILLING_SIMULATION_ENABLED
  fi
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
