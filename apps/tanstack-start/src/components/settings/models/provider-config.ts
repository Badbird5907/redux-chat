import type { LucideIcon } from "lucide-react";
import { Cloud, Waypoints } from "lucide-react";

import type { ByokProviderId } from "@redux/shared/models";

export interface ByokProviderMeta {
  label: string;
  description: string;
  accountId?: boolean;
  /** Maker slug in the logo registry, for providers that have a brand mark. */
  logoMaker?: string;
  /** Fallback glyph for providers without a brand mark. */
  icon?: LucideIcon;
}

export const PROVIDERS: Record<ByokProviderId, ByokProviderMeta> = {
  openai: {
    label: "OpenAI",
    description: "Route supported OpenAI models directly through your account.",
    logoMaker: "openai",
  },
  anthropic: {
    label: "Anthropic",
    description: "Use your Anthropic account for supported Claude models.",
    logoMaker: "anthropic",
  },
  vertex: {
    label: "Google Vertex",
    description: "Use your Google Vertex API key for supported Gemini models.",
    logoMaker: "google",
  },
  workersai: {
    label: "Cloudflare Workers AI",
    description: "Use your Cloudflare account and API token.",
    accountId: true,
    icon: Cloud,
  },
  openrouter: {
    label: "OpenRouter",
    description: "Use OpenRouter as a broad fallback across model makers.",
    icon: Waypoints,
  },
};
