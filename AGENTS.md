# AGENTS.md

## Cursor Cloud specific instructions

This is a pnpm + Turborepo monorepo ("Redux Chat"): a TanStack Start web app
(`apps/tanstack-start`, dev port **3712**) backed by a Convex backend
(`packages/backend`). Standard commands live in `README.md` and `package.json`;
the notes below only cover non-obvious things needed to run it in a Cloud Agent.

### Toolchain / Node
- The repo requires **Node 24** (`.nvmrc`), but the VM's default `node`
  (`/exec-daemon/node`) is Node 22 and sits early in `PATH`. Interactive/login
  shells are already fixed to use Node 24 + pnpm 10.33.2 via `~/.bashrc`
  (`nvm use 24` + a `PATH` prepend), so `node`/`pnpm` work normally in tmux and
  new terminals. The update script's `pnpm install` works on either Node version
  (there is no `engine-strict`), but **run the app/Convex with Node 24**.

### Services (all must run for end-to-end use)
| Service | How to start | Notes |
|---|---|---|
| Local infra (Redis, etc.) | `docker compose up -d` | Docker isn't auto-started: run `sudo dockerd > /var/log/dockerd.log 2>&1 &` first if `docker` errors. |
| Convex backend (local) | `bash scripts/dev/cloud-local-backend.sh` | Serves on `:3210` (API) / `:3211` (HTTP actions). See below. |
| Web app | `pnpm -F @redux/tanstack-start dev` (or `pnpm dev`) | serves on `localhost` port `3712` |

### Convex local backend (the non-obvious part)
- There is **no cloud Convex**; an anonymous **local** deployment is used. Data
  lives in `packages/backend/.convex/local/default/` (gitignored), so a fresh VM
  starts empty and you must re-run the setup script.
- `convex dev --once` spins up the local DB + deploys functions and then exits
  (it does **not** keep serving). `scripts/dev/cloud-local-backend.sh` therefore
  deploys with `--once`, then launches the persistent `convex-local-backend`
  binary to keep `:3210` serving, and finally syncs secrets onto the deployment.
  The script is idempotent.
- **Secrets:** real credentials (OpenAI, OpenRouter, Stripe, Silo,
  `INTERNAL_CONVEX_SECRET`, `AUTH_SECRET`, ...) are provided as injected Cloud
  Agent env vars. The app reads them directly from its environment (injected env
  overrides `.env`). The **Convex deployment** does NOT see them automatically —
  the setup script copies them onto the deployment with `convex env set`. If chat
  fails with `STRIPE_SECRET_KEY ... not set` or auth fails, re-run the script.
- `INTERNAL_CONVEX_SECRET` **must match** between the app (injected) and the
  Convex deployment, or sending a chat message fails with
  `Invalid userMessageId signature`. The script keeps them aligned.
- `AUTH_SECRET` is used by Better Auth to encrypt its JWKS in the DB. If you
  change it after users exist you get `Failed to decrypt private key`; wipe
  `packages/backend/.convex/local/default` and re-run the script to reset.
- Only the local Convex URLs are added to `.env`
  (`VITE_CONVEX_URL`/`VITE_CONVEX_SITE_URL`); everything else comes from injected
  secrets. Recreate `.env` with `cp .env.example .env` then append those two vars
  if needed.

### Lint gotcha
- `convex dev`/`convex codegen` (with codegen enabled) regenerates
  `packages/backend/convex/_generated/**`, the `_generated/ai/*` + `.agents`
  skills files, and an untracked `packages/backend/convex/tsconfig.json`. That
  generated `convex/tsconfig.json` shadows the type-aware ESLint program and makes
  `pnpm lint` report ~16 bogus `no-unnecessary-condition` errors. **Delete it**
  (`rm -f packages/backend/convex/tsconfig.json`) before linting, or run convex
  with `--codegen disable` (the setup script does both). Don't commit those
  regenerated files.

### Tests
- `pnpm test` has **2 pre-existing failures** in `@redux/backend`
  (`convex/http.test.ts` collection + `threadShares.test.ts` "forks a share")
  caused by t3-env's server/client guard in the `edge-runtime` test env
  (`Attempted to access a server-side environment variable on the client`). They
  reproduce on a clean checkout and are unrelated to environment setup.

### Dev-only admin login (`/api/dev-login`)
For local development there is a dev-only auto-login route:
`GET /api/dev-login` (on the app at `localhost` port `3712`). Visiting it provisions a fixed admin
account (`dev-admin@local.test`) if missing — **it checks for an existing user
first and skips creation if one exists** — signs in (setting the session
cookie), ensures the account has the `admin` role, and redirects to `/`.
- Implemented in `apps/tanstack-start/src/routes/api/dev-login.ts` (the route)
  and `packages/backend/convex/functions/devAuth.ts` (`ensureDevAdmin`).
- **Triple-gated:** the route 404s unless `NODE_ENV !== "production"`; the
  Convex `ensureDevAdmin` mutation requires `INTERNAL_CONVEX_SECRET` (via
  `backendMutation`) and refuses unless `SITE_URL` is a local origin. Do not
  loosen these gates.
- After adding/editing Convex functions, redeploy + regen types: stop the local
  backend, run `pnpm -F @redux/backend exec convex dev --once` (codegen on),
  delete `convex/tsconfig.json`, then re-run `scripts/dev/cloud-local-backend.sh`.
  Committing the regenerated `convex/_generated/api.d.ts` and
  `apps/tanstack-start/src/routeTree.gen.ts` is expected.

### Verified working
Sign up with email/password at `/auth/sign-up`, land in the authenticated chat,
send a message, and the AI replies (e.g. "What is 7 times 6?" → "42"). This
exercises the full stack: frontend → local Convex → Better Auth → DB → AI
provider → Stripe billing. The `/api/dev-login` route logs in as an admin and
`/admin` loads.
