import type {
  ChatGPTTokens,
  DeviceCode,
} from "@opencoredev/loginwithchatgpt-core";

import type { ByokProviderId } from "@redux/shared/models";

export const BYOK_OAUTH_CONNECTOR_IDS = ["chatgpt", "openrouter"] as const;

export type ByokOAuthConnectorId = (typeof BYOK_OAUTH_CONNECTOR_IDS)[number];

export type StoredOAuthFlow =
  | {
      connector: "chatgpt";
      provider: "openai";
      stage: "device";
      device: DeviceCode;
      expiresAt: number;
    }
  | {
      connector: "chatgpt";
      provider: "openai";
      stage: "authorized";
      tokens: ChatGPTTokens;
      interval: number;
      expiresAt: number;
    }
  | {
      connector: "openrouter";
      provider: "openrouter";
      codeVerifier: string;
      callbackUrl: string;
      expiresAt: number;
    };

export type OAuthStartResponse =
  | {
      mode: "device";
      flowId: string;
      userCode: string;
      verificationUrl: string;
      intervalMs: number;
      expiresAt: number;
    }
  | {
      mode: "redirect";
      flowId: string;
      authorizationUrl: string;
      expiresAt: number;
    };

export type OAuthPollResponse =
  | { status: "pending"; retryAfterMs: number; expiresAt: number }
  | { status: "connected"; provider: ByokProviderId }
  | { status: "expired" };

export function isByokOAuthConnectorId(
  value: string,
): value is ByokOAuthConnectorId {
  return BYOK_OAUTH_CONNECTOR_IDS.includes(value as ByokOAuthConnectorId);
}

export function providerForOAuthConnector(
  connector: ByokOAuthConnectorId,
): ByokProviderId {
  return connector === "chatgpt" ? "openai" : "openrouter";
}
