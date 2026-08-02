import type { ByokProviderId } from "@redux/shared/models";

export const PROVIDERS: Record<
  ByokProviderId,
  { label: string; description: string; accountId?: boolean }
> = {
  openai: {
    label: "OpenAI",
    description: "Route supported OpenAI models directly through your account.",
  },
  anthropic: {
    label: "Anthropic",
    description: "Use your Anthropic account for supported Claude models.",
  },
  vertex: {
    label: "Google Vertex",
    description: "Use your Google Vertex API key for supported Gemini models.",
  },
  workersai: {
    label: "Cloudflare Workers AI",
    description: "Use your Cloudflare account and API token.",
    accountId: true,
  },
  openrouter: {
    label: "OpenRouter",
    description: "Use OpenRouter as a broad fallback across model makers.",
  },
};
