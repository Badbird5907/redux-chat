import type { ByokProviderId } from "@redux/shared/models";

import type {
  ByokOAuthConnectorId,
  OAuthPollResponse,
  OAuthStartResponse,
} from "./types";
import { loadFreshChatGptCredential } from "../chatgpt-refresh";
import { pollChatGptOAuth, startChatGptOAuth } from "./chatgpt";
import { completeOpenRouterOAuth, startOpenRouterOAuth } from "./openrouter";

export interface OAuthRefreshResult {
  provider: ByokProviderId;
  modelCount?: number;
}

export interface ByokOAuthConnector {
  id: ByokOAuthConnectorId;
  provider: ByokProviderId;
  authorizationMode: "device" | "redirect";
  version: string;
  start(args: { userId: string; origin: string }): Promise<OAuthStartResponse>;
  poll?(args: { userId: string; flowId: string }): Promise<OAuthPollResponse>;
  completeRedirect?(args: {
    userId: string;
    flowId: string;
    code: string;
  }): Promise<void>;
  refresh?(args: { userId: string }): Promise<OAuthRefreshResult | undefined>;
}

export const BYOK_OAUTH_CONNECTORS: Record<
  ByokOAuthConnectorId,
  ByokOAuthConnector
> = {
  chatgpt: {
    id: "chatgpt",
    provider: "openai",
    authorizationMode: "device",
    version: "0.2.0",
    start: ({ userId }) => startChatGptOAuth(userId),
    poll: pollChatGptOAuth,
    refresh: async ({ userId }) => {
      const credential = await loadFreshChatGptCredential({
        userId,
        forceDiscovery: true,
      });
      return credential
        ? {
            provider: "openai",
            modelCount: credential.payload.modelIds.length,
          }
        : undefined;
    },
  },
  openrouter: {
    id: "openrouter",
    provider: "openrouter",
    authorizationMode: "redirect",
    version: "pkce-s256-v1",
    start: startOpenRouterOAuth,
    completeRedirect: completeOpenRouterOAuth,
  },
};
