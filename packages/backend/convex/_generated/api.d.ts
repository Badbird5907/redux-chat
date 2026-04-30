/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as env from "../env.js";
import type * as functions_attachments from "../functions/attachments.js";
import type * as functions_defaultMessageSettings from "../functions/defaultMessageSettings.js";
import type * as functions_embeddings from "../functions/embeddings.js";
import type * as functions_index from "../functions/index.js";
import type * as functions_instructions from "../functions/instructions.js";
import type * as functions_internal from "../functions/internal.js";
import type * as functions_mcpServers from "../functions/mcpServers.js";
import type * as functions_migrations from "../functions/migrations.js";
import type * as functions_modelFavorites from "../functions/modelFavorites.js";
import type * as functions_projects from "../functions/projects.js";
import type * as functions_threads from "../functions/threads.js";
import type * as functions_user from "../functions/user.js";
import type * as http from "../http.js";
import type * as polar from "../polar.js";
import type * as zod from "../zod.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  env: typeof env;
  "functions/attachments": typeof functions_attachments;
  "functions/defaultMessageSettings": typeof functions_defaultMessageSettings;
  "functions/embeddings": typeof functions_embeddings;
  "functions/index": typeof functions_index;
  "functions/instructions": typeof functions_instructions;
  "functions/internal": typeof functions_internal;
  "functions/mcpServers": typeof functions_mcpServers;
  "functions/migrations": typeof functions_migrations;
  "functions/modelFavorites": typeof functions_modelFavorites;
  "functions/projects": typeof functions_projects;
  "functions/threads": typeof functions_threads;
  "functions/user": typeof functions_user;
  http: typeof http;
  polar: typeof polar;
  zod: typeof zod;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
