# Workers AI Proxy

Cloudflare Worker exposing a small JSON proxy over the Workers AI binding.

## Development

```bash
pnpm --filter @redux/workers-ai-proxy dev
```

The AI binding uses Cloudflare's remote service during local development.

## API

Health check:

```bash
curl http://localhost:8787/health
```

Run a model:

```bash
curl http://localhost:8787/v1/run \
  --header "content-type: application/json" \
  --data '{
    "model": "@cf/meta/llama-3.1-8b-instruct",
    "input": {
      "messages": [{ "role": "user", "content": "Hello" }]
    }
  }'
```

## Deploy

```bash
pnpm --filter @redux/workers-ai-proxy deploy
```
