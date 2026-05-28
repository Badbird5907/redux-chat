import { createFileRoute } from "@tanstack/react-router";

import { env } from "@/env";

const DEFAULT_POSTHOG_INGEST_HOST = "https://us.i.posthog.com";
const DEFAULT_POSTHOG_ASSETS_HOST = "https://us-assets.i.posthog.com";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getPostHogIngestHost(): string {
  return (env.VITE_PUBLIC_POSTHOG_HOST ?? DEFAULT_POSTHOG_INGEST_HOST).replace(
    /\/$/,
    "",
  );
}

function getPostHogAssetsHost(ingestHost: string): string {
  if (/^https:\/\/(us|eu)\.i\.posthog\.com$/i.test(ingestHost)) {
    return ingestHost.replace(
      /^https:\/\/(us|eu)\.i\.posthog\.com$/i,
      "https://$1-assets.i.posthog.com",
    );
  }

  return DEFAULT_POSTHOG_ASSETS_HOST;
}

function copyProxyHeaders(headers: Headers): Headers {
  const copied = new Headers();

  for (const [key, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      copied.set(key, value);
    }
  }

  return copied;
}

async function proxyPostHogRequest(request: Request): Promise<Response> {
  const sourceUrl = new URL(request.url);
  const posthogPath = sourceUrl.pathname.replace(/^\/ingest/, "") || "/";
  const ingestHost = getPostHogIngestHost();
  const targetHost = posthogPath.startsWith("/static/")
    ? getPostHogAssetsHost(ingestHost)
    : ingestHost;
  const targetUrl = new URL(`${targetHost}${posthogPath}`);

  targetUrl.search = sourceUrl.search;

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: copyProxyHeaders(request.headers),
    body,
    redirect: "manual",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: copyProxyHeaders(response.headers),
  });
}

export const Route = createFileRoute("/ingest/$")({
  server: {
    handlers: {
      DELETE: ({ request }) => proxyPostHogRequest(request),
      GET: ({ request }) => proxyPostHogRequest(request),
      HEAD: ({ request }) => proxyPostHogRequest(request),
      OPTIONS: ({ request }) => proxyPostHogRequest(request),
      PATCH: ({ request }) => proxyPostHogRequest(request),
      POST: ({ request }) => proxyPostHogRequest(request),
      PUT: ({ request }) => proxyPostHogRequest(request),
    },
  },
});
