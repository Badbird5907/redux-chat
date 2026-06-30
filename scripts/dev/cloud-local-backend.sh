#!/usr/bin/env bash
#
# cloud-local-backend.sh
#
# Brings up a local (anonymous) Convex backend for Cloud Agent / local development
# and syncs the relevant secrets onto that deployment so auth, billing and the AI
# tools work end to end.
#
# This is intended for ephemeral dev environments (e.g. Cursor Cloud Agents) where:
#   * Node 24 + pnpm are already installed (see AGENTS.md).
#   * The real credentials are present in the *process environment* as injected
#     secrets (OPENAI_API_KEY, STRIPE_SECRET_KEY, INTERNAL_CONVEX_SECRET, ...).
#
# It is idempotent: re-running it is safe. If a backend is already serving on
# :3210 it only re-syncs env vars.
#
# Usage:  bash scripts/dev/cloud-local-backend.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/packages/backend"
DATA_DIR="$BACKEND_DIR/.convex/local/default"
CONVEX_URL="http://127.0.0.1:3210"
CONVEX_SITE_URL="http://127.0.0.1:3211"

log() { printf '\033[36m[local-convex]\033[0m %s\n' "$*"; }

backend_healthy() { curl -sf -o /dev/null "$CONVEX_URL/version"; }

# 1. Spin up the local deployment + deploy functions if nothing is serving yet.
#    `convex dev --once` is non-blocking: it deploys schema/functions and exits.
#    `--codegen disable` avoids regenerating convex/tsconfig.json, which otherwise
#    breaks `pnpm lint` (see AGENTS.md).
if backend_healthy; then
  log "Convex backend already serving on $CONVEX_URL"
else
  log "Deploying functions to a fresh local deployment (convex dev --once)..."
  ( cd "$BACKEND_DIR" && CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --once --codegen disable )

  log "Starting the persistent local Convex backend..."
  BIN="$(ls -t "$HOME"/.cache/convex/binaries/*/convex-local-backend 2>/dev/null | head -1)"
  if [[ -z "${BIN:-}" || ! -x "$BIN" ]]; then
    echo "Could not find the convex-local-backend binary under ~/.cache/convex/binaries" >&2
    exit 1
  fi
  INSTANCE_SECRET="$(python3 -c "import json;print(json.load(open('$DATA_DIR/config.json'))['instanceSecret'])")"
  # Fully detach the backend: new session (setsid), stdin from /dev/null and
  # stdout/stderr to a log file, then disown so this script never waits on it
  # (otherwise piping this script's output, e.g. `... | tail`, would hang).
  ( cd "$DATA_DIR" && setsid "$BIN" \
      --port 3210 --site-proxy-port 3211 \
      --instance-name anonymous-agent \
      --instance-secret "$INSTANCE_SECRET" \
      --local-storage convex_local_storage \
      convex_local_backend.sqlite3 </dev/null >/tmp/convex-backend.log 2>&1 & )
  disown -a 2>/dev/null || true

  log "Waiting for the backend to become healthy..."
  for _ in $(seq 1 30); do backend_healthy && break; sleep 1; done
  backend_healthy || { echo "Convex backend failed to start; see /tmp/convex-backend.log" >&2; exit 1; }
fi

# 2. Sync secrets from the process environment onto the Convex deployment.
ADMIN_KEY="$(python3 -c "import json;print(json.load(open('$DATA_DIR/config.json'))['adminKey'])")"

set_env() {
  local name="$1" value="$2"
  [[ -n "$value" ]] || { log "skip $name (not set in environment)"; return 0; }
  ( cd "$BACKEND_DIR" && pnpm exec convex env set "$name" "$value" \
      --url "$CONVEX_URL" --admin-key "$ADMIN_KEY" >/dev/null )
  log "set $name"
}

log "Syncing secrets onto the local Convex deployment..."
set_env INTERNAL_CONVEX_SECRET "${INTERNAL_CONVEX_SECRET:-}"
set_env AUTH_SECRET "${AUTH_SECRET:-}"
set_env AUTH_GITHUB_ID "${AUTH_GITHUB_ID:-}"
set_env AUTH_GITHUB_SECRET "${AUTH_GITHUB_SECRET:-}"
set_env AUTH_GOOGLE_ID "${AUTH_GOOGLE_ID:-}"
set_env AUTH_GOOGLE_SECRET "${AUTH_GOOGLE_SECRET:-}"
set_env SILO_URL "${SILO_URL:-}"
set_env SILO_TOKEN "${SILO_TOKEN:-}"
set_env SILO_CDN "${SILO_CDN:-${VITE_SILO_CDN:-}}"
set_env OPENAI_API_KEY "${OPENAI_API_KEY:-}"
set_env OPENROUTER_API_KEY "${OPENROUTER_API_KEY:-}"
set_env GOOGLE_VERTEX_API_KEY "${GOOGLE_VERTEX_API_KEY:-}"
set_env ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
set_env AA_API_KEY "${AA_API_KEY:-}"
set_env EXA_API_KEY "${EXA_API_KEY:-}"
set_env E2B_API_KEY "${E2B_API_KEY:-}"
set_env STRIPE_SECRET_KEY "${STRIPE_SECRET_KEY:-}"
set_env STRIPE_WEBHOOK_SECRET "${STRIPE_WEBHOOK_SECRET:-}"
set_env STRIPE_PLUS_PRICE_ID "${STRIPE_PLUS_PRICE_ID:-}"
set_env STRIPE_PRO_PRICE_ID "${STRIPE_PRO_PRICE_ID:-}"
set_env STRIPE_CREDIT_TOP_UP_PRODUCT_ID "${STRIPE_CREDIT_TOP_UP_PRODUCT_ID:-}"
set_env CLOUDFLARE_ACCOUNT_ID "${CLOUDFLARE_ACCOUNT_ID:-}"
set_env CLOUDFLARE_API_KEY "${CLOUDFLARE_API_KEY:-}"
set_env DOCUMENT_CONVERTER_URL "${DOCUMENT_CONVERTER_URL:-}"
set_env DOCUMENT_CONVERTER_BASIC_AUTH "${DOCUMENT_CONVERTER_BASIC_AUTH:-}"
set_env DOCUMENT_CONVERTER_TIMEOUT_MS "${DOCUMENT_CONVERTER_TIMEOUT_MS:-}"
# SITE_URL drives Better Auth cookies/redirects; use the injected value (the local
# app origin). Falls back to the dev app origin built from the dev port if unset.
set_env SITE_URL "${SITE_URL:-http://localhost:${APP_PORT:-3712}}"

# convex codegen may recreate convex/tsconfig.json which breaks `pnpm lint`; drop it.
rm -f "$BACKEND_DIR/convex/tsconfig.json"

log "Done. Convex API: $CONVEX_URL  | HTTP actions: $CONVEX_SITE_URL"
log "Point the app at these via VITE_CONVEX_URL / VITE_CONVEX_SITE_URL (already in .env)."
