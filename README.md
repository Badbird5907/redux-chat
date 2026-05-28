# Redux Chat

Redux Chat is yet another AI chat app, except this one is built to be actually good.

I built Redux Chat because I was tired of waiting for other chat apps to add the features I wanted. I liked Perplexity's better search, Claude's projects and learning style, and T3 Chat's broad model selection, but I kept bouncing between different apps depending on the task. Redux Chat is my attempt at one chat app to rule them all.

## Features

- Wide model selection from top labs, including OpenAI, Anthropic, Google, Moonshot, and more
- A fast, responsive web app that stays usable during long chats
- Customizable system prompts
- Custom MCP servers over HTTP transport
- Projects with RAG (Retrieval Augmented Generation)
- Universal file support for Office documents, PDFs, and other attachments
- Python sandbox tools for analysis workflows

### Document support across models

Redux Chat tries its best to let models support as many file types as possible. Not every model accepts the same attachment types, so when the chosen model supports a file natively it is sent as-is; otherwise it is converted to PDF, and if the model doesn’t accept PDF either, text extracted from that PDF is sent instead.

Those conversions run through [Gotenberg](https://gotenberg.dev/), which calls the LibreOffice CLI so DOCX, PPTX, spreadsheets, and similar formats can be normalized reliably.


## Tech Stack

- [TanStack Start](https://tanstack.com/start) for the web app
- [Convex](https://www.convex.dev/) for the backend and database
- [Silo](https://silo.evanyu.dev/) for file uploads and storage (I built this!)
- [Upstash Redis](https://upstash.com/) for Redis-backed app infrastructure
- [shadcn/ui](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com/) for the interface
- [Turborepo](https://turbo.build/repo) and [pnpm](https://pnpm.io/) for the monorepo

## Local Development

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start local infrastructure, including Redis, Mailpit, and MinIO:

```bash
docker compose up -d
```

Run the app and workspace dev tasks:

```bash
pnpm dev
```

The TanStack Start app runs on port `3712` when started directly.

## Useful Commands

```bash
# Run all dev tasks through Turbo
pnpm dev

# Build the workspace
pnpm build

# Typecheck the workspace
pnpm typecheck

# Lint and format
pnpm lint
pnpm format

# Fix lint and formatting issues
pnpm lint:fix
pnpm format:fix

# Run only the TanStack Start app
pnpm -F @redux/tanstack-start dev

# Run Convex locally
pnpm -F @redux/backend dev

# Generate Better Auth Convex schema
pnpm auth:generate

# Refresh generated model metadata
pnpm models:generate
```
