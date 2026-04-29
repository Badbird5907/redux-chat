import { PROVIDERS } from "@redux/shared/models";
import type { ChatModelConfig } from "@redux/shared/models";
import type { ComponentType, SVGProps } from "react";

import { AnthropicLogo, AnthropicLogoWhite } from "./anthropic";
import { DeepSeekLogo, DeepSeekLogoWhite } from "./deepseek";
import {
  GeminiLogo,
  GeminiLogoWhite,
  GoogleLogo,
  GoogleLogoWhite,
} from "./google";
import { MetaLogo, MetaLogoWhite } from "./meta";
import { MoonshotLogo, MoonshotLogoWhite } from "./moonshot";
import { KimiLogo, KimiLogoWhite } from "./moonshot/kimi";
import { OpenAILogo, OpenAILogoWhite } from "./openai";
import { xAILogo, xAILogoWhite } from "./xai";
import { GrokLogo, GrokLogoWhite } from "./xai/grok";

type LogoComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface LogoRegistryItem {
  name: string;
  Logo: LogoComponent;
  LogoWhite: LogoComponent;
  surface: "light" | "dark";
}

const anthropicLogo: LogoRegistryItem = {
  name: "Anthropic",
  Logo: AnthropicLogo,
  LogoWhite: AnthropicLogoWhite,
  surface: "dark",
};

const deepseekLogo: LogoRegistryItem = {
  name: "DeepSeek",
  Logo: DeepSeekLogo,
  LogoWhite: DeepSeekLogoWhite,
  surface: "light",
};

const googleLogo: LogoRegistryItem = {
  name: "Google",
  Logo: GoogleLogo,
  LogoWhite: GoogleLogoWhite,
  surface: "light",
};

const geminiLogo: LogoRegistryItem = {
  name: "Gemini",
  Logo: GeminiLogo,
  LogoWhite: GeminiLogoWhite,
  surface: "light",
};

const grokLogo: LogoRegistryItem = {
  name: "Grok",
  Logo: GrokLogo,
  LogoWhite: GrokLogoWhite,
  surface: "dark",
};

const kimiLogo: LogoRegistryItem = {
  name: "Kimi",
  Logo: KimiLogo,
  LogoWhite: KimiLogoWhite,
  surface: "light",
};

const metaLogo: LogoRegistryItem = {
  name: "Meta",
  Logo: MetaLogo,
  LogoWhite: MetaLogoWhite,
  surface: "light",
};

const moonshotLogo: LogoRegistryItem = {
  name: "Moonshot",
  Logo: MoonshotLogo,
  LogoWhite: MoonshotLogoWhite,
  surface: "light",
};

const openaiLogo: LogoRegistryItem = {
  name: "OpenAI",
  Logo: OpenAILogo,
  LogoWhite: OpenAILogoWhite,
  surface: "dark",
};

const xaiLogo: LogoRegistryItem = {
  name: "xAI",
  Logo: xAILogo,
  LogoWhite: xAILogoWhite,
  surface: "dark",
};

export const LOGO_REGISTRY = {
  anthropic: anthropicLogo,
  deepseek: deepseekLogo,
  google: googleLogo,
  gemini: geminiLogo,
  grok: grokLogo,
  kimi: kimiLogo,
  meta: metaLogo,
  moonshot: moonshotLogo,
  openai: openaiLogo,
  xai: xaiLogo,
} as const satisfies Record<string, LogoRegistryItem>;

const sharedProviderLogos = {
  anthropic: LOGO_REGISTRY.anthropic,
  google: LOGO_REGISTRY.google,
  openai: LOGO_REGISTRY.openai,
} satisfies Record<(typeof PROVIDERS)[number]["slug"], LogoRegistryItem>;

export type SharedModelProviderSlug = keyof typeof sharedProviderLogos;

export const SHARED_PROVIDER_LOGOS = sharedProviderLogos;

export const SHARED_PROVIDER_LOGO_ENTRIES = PROVIDERS.flatMap((provider) => {
  if (!isSharedModelProviderSlug(provider.slug)) {
    return [];
  }

  return [{ provider, logo: SHARED_PROVIDER_LOGOS[provider.slug] }];
});

export const LOGO_SHOWCASE = [
  LOGO_REGISTRY.anthropic,
  LOGO_REGISTRY.deepseek,
  LOGO_REGISTRY.google,
  LOGO_REGISTRY.gemini,
  LOGO_REGISTRY.grok,
  LOGO_REGISTRY.kimi,
  LOGO_REGISTRY.meta,
  LOGO_REGISTRY.moonshot,
  LOGO_REGISTRY.openai,
  LOGO_REGISTRY.xai,
] as const;

export function isSharedModelProviderSlug(
  value: string,
): value is SharedModelProviderSlug {
  return value in SHARED_PROVIDER_LOGOS;
}

export function getSharedProviderLogo(providerSlug: string) {
  return isSharedModelProviderSlug(providerSlug)
    ? SHARED_PROVIDER_LOGOS[providerSlug]
    : undefined;
}

export function getModelProviderLogo(
  model: Pick<ChatModelConfig, "maker">,
) {
  return getSharedProviderLogo(model.maker);
}
