#!/bin/bash
pushd .
cd ./packages/backend
pnpm run convex deploy --cmd "pnpm run build:app"
pnpm run convex env set --preview-name $VERCEL_GIT_COMMIT_REF SITE_URL $VERCEL_URL
echo "AEHJNE: apps/tanstack-start/.vercel/output"
ls -la apps/tanstack-start/.vercel/output
echo "FESJNHF: apps/tanstack-start/.vercel"
ls -la apps/tanstack-start/.vercel
ls -la /vercel/output
popd
cd ./apps/tanstack-start