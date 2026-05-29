#!/bin/bash
pushd .
cd ./packages/backend
pnpm run convex deploy --cmd "pnpm run build:app"
pnpm run convex env set --preview-name $VERCEL_GIT_COMMIT_REF SITE_URL $VERCEL_URL