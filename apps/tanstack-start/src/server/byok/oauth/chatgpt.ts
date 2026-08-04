import { randomUUID } from "node:crypto";
import { createChatGPT } from "@opencoredev/loginwithchatgpt-ai";
import {
  exchangeDeviceAuthorization,
  parseUser,
  pollDeviceCode,
  requestDeviceCode,
  resolveConfig,
} from "@opencoredev/loginwithchatgpt-core";

import { MODEL_ROUTES } from "@redux/shared/models";

import type { ChatGptProviderCredentialPayload } from "../crypto";
import type {
  OAuthPollResponse,
  OAuthStartResponse,
  StoredOAuthFlow,
} from "./types";
import { env } from "@/env";
import { upsertProviderCredential } from "../credential-store";
import {
  deleteOAuthFlowIfOwned,
  loadOAuthFlow,
  saveOAuthFlow,
} from "./flow-store";
import { logOAuthEvent } from "./http";
import { acquireRedisLease, releaseRedisLease } from "./redis-coordination";

const POLL_LEASE_PREFIX = "redux-chat:byok:chatgpt-poll:";
const AUTHORIZED_FLOW_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CHATGPT_CLIENT_VERSION = "0.146.0";
type AuthorizedChatGptFlow = Extract<
  StoredOAuthFlow,
  { connector: "chatgpt"; stage: "authorized" }
>;

export async function startChatGptOAuth(
  userId: string,
): Promise<OAuthStartResponse> {
  const device = await requestDeviceCode(chatGptConfig());
  const flowId = randomUUID();
  await saveOAuthFlow({
    flowId,
    userId,
    connector: "chatgpt",
    flow: {
      connector: "chatgpt",
      provider: "openai",
      stage: "device",
      device,
      expiresAt: device.expiresAt,
    },
  });
  return {
    mode: "device",
    flowId,
    userCode: device.userCode,
    verificationUrl: device.verificationUrl,
    intervalMs: device.interval * 1000,
    expiresAt: device.expiresAt,
  };
}

export async function pollChatGptOAuth(args: {
  userId: string;
  flowId: string;
}): Promise<OAuthPollResponse> {
  const flow = await loadOAuthFlow({
    ...args,
    connector: "chatgpt",
  });
  if (flow?.connector !== "chatgpt" || flow.expiresAt <= Date.now()) {
    if (flow) {
      await deleteOAuthFlowIfOwned({ ...args, connector: "chatgpt" });
    }
    return { status: "expired" };
  }

  const interval =
    flow.stage === "device" ? flow.device.interval : flow.interval;
  const retryAfterMs = interval * 1000;
  const leaseKey = `${POLL_LEASE_PREFIX}${args.flowId}`;
  const leaseToken = await acquireRedisLease(leaseKey, retryAfterMs);
  if (!leaseToken) {
    return { status: "pending", retryAfterMs, expiresAt: flow.expiresAt };
  }

  let keepLeaseUntilExpiry = false;
  try {
    const config = chatGptConfig();
    // Every upstream poll consumes the provider-specified cadence, including
    // failed attempts. Leaving the lease in Redis enforces that cadence across
    // concurrent server instances.
    keepLeaseUntilExpiry = true;
    let authorizedFlow: AuthorizedChatGptFlow;
    if (flow.stage === "device") {
      const poll = await pollDeviceCode(config, flow.device);
      if (poll.status === "pending") {
        return { status: "pending", retryAfterMs, expiresAt: flow.expiresAt };
      }
      const tokens = await exchangeDeviceAuthorization(config, poll);
      if (!tokens.accountId) {
        throw new Error("ChatGPT authorization did not include an account id.");
      }
      authorizedFlow = {
        connector: "chatgpt",
        provider: "openai",
        stage: "authorized",
        tokens,
        interval,
        expiresAt: Date.now() + AUTHORIZED_FLOW_TTL_MS,
      };
      await saveOAuthFlow({
        ...args,
        connector: "chatgpt",
        flow: authorizedFlow,
      });
    } else {
      authorizedFlow = flow;
    }
    const { tokens } = authorizedFlow;
    let modelIds: string[];
    try {
      const accountId = tokens.accountId;
      if (!accountId) {
        throw new Error("ChatGPT authorization did not include an account id.");
      }
      const chatgpt = createChatGPT({
        credentials: tokens,
        clientVersion: config.clientVersion,
      });
      modelIds = Array.from(
        new Set(
          (await chatgpt.listModels()).filter((model) => model.length > 0),
        ),
      );
      if (modelIds.length === 0) {
        throw new Error("No ChatGPT models are available for this account.");
      }
      const profile = parseUser(tokens.idToken) ?? {
        accountId,
      };
      const payload: ChatGptProviderCredentialPayload = {
        version: 2,
        kind: "chatgpt_oauth",
        tokens,
        profile,
        modelIds,
        defaultModel: selectDefaultChatGptModel(modelIds),
      };
      await upsertProviderCredential({
        userId: args.userId,
        provider: "openai",
        payload,
        metadata: {
          displaySuffix: profile.accountId.slice(-4),
          displayLabel: profile.email ?? profile.name ?? profile.plan,
          availableModelIds: modelIds,
          supportsImageGeneration: true,
        },
      });
    } catch (error) {
      logOAuthEvent({
        connector: "chatgpt",
        connectorVersion: "0.2.0",
        stage: "model_discovery",
        status: "failure",
      });
      throw error;
    }
    await deleteOAuthFlowIfOwned({ ...args, connector: "chatgpt" });
    logOAuthEvent({
      connector: "chatgpt",
      connectorVersion: "0.2.0",
      stage: "model_discovery",
      status: "success",
      modelCount: modelIds.length,
    });
    return { status: "connected", provider: "openai" };
  } finally {
    if (!keepLeaseUntilExpiry) {
      await releaseRedisLease(leaseKey, leaseToken);
    }
  }
}

export function selectDefaultChatGptModel(modelIds: readonly string[]): string {
  const available = new Set(modelIds);
  const registered = MODEL_ROUTES.find(
    (route) =>
      route.provider === "openai" &&
      !route.supports.imageOutput &&
      !route.supports.imageGenerationTool &&
      available.has(route.vendorId),
  );
  return registered?.vendorId ?? modelIds[0] ?? "gpt-5.5";
}

export function chatGptConfig() {
  return resolveConfig({
    clientVersion: env.CHATGPT_CLIENT_VERSION ?? DEFAULT_CHATGPT_CLIENT_VERSION,
  });
}
