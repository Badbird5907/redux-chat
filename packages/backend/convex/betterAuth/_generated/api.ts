/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adapter from "../adapter.js";
import type * as audit_log_adapters_index from "../audit_log/adapters/index.js";
import type * as audit_log_adapters_memory from "../audit_log/adapters/memory.js";
import type * as audit_log_client from "../audit_log/client.js";
import type * as audit_log_endpoints_get_log from "../audit_log/endpoints/get_log.js";
import type * as audit_log_endpoints_index from "../audit_log/endpoints/index.js";
import type * as audit_log_endpoints_insert_log from "../audit_log/endpoints/insert_log.js";
import type * as audit_log_endpoints_list_logs from "../audit_log/endpoints/list_logs.js";
import type * as audit_log_hooks_after from "../audit_log/hooks/after.js";
import type * as audit_log_hooks_before from "../audit_log/hooks/before.js";
import type * as audit_log_hooks_index from "../audit_log/hooks/index.js";
import type * as audit_log_index from "../audit_log/index.js";
import type * as audit_log_internal from "../audit_log/internal.js";
import type * as audit_log_plugin from "../audit_log/plugin.js";
import type * as audit_log_types from "../audit_log/types.js";
import type * as audit_log_utils_index from "../audit_log/utils/index.js";
import type * as audit_log_utils_normalize_path from "../audit_log/utils/normalize_path.js";
import type * as audit_log_utils_parse_metadata from "../audit_log/utils/parse_metadata.js";
import type * as audit_log_utils_request_meta from "../audit_log/utils/request_meta.js";
import type * as audit_log_utils_retry from "../audit_log/utils/retry.js";
import type * as audit_log_utils_sanitize from "../audit_log/utils/sanitize.js";
import type * as audit_log_utils_severity from "../audit_log/utils/severity.js";
import type * as audit_log_utils_validate_entry from "../audit_log/utils/validate_entry.js";
import type * as audit_log_utils_validate_metadata from "../audit_log/utils/validate_metadata.js";
import type * as auth from "../auth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  adapter: typeof adapter;
  "audit_log/adapters/index": typeof audit_log_adapters_index;
  "audit_log/adapters/memory": typeof audit_log_adapters_memory;
  "audit_log/client": typeof audit_log_client;
  "audit_log/endpoints/get_log": typeof audit_log_endpoints_get_log;
  "audit_log/endpoints/index": typeof audit_log_endpoints_index;
  "audit_log/endpoints/insert_log": typeof audit_log_endpoints_insert_log;
  "audit_log/endpoints/list_logs": typeof audit_log_endpoints_list_logs;
  "audit_log/hooks/after": typeof audit_log_hooks_after;
  "audit_log/hooks/before": typeof audit_log_hooks_before;
  "audit_log/hooks/index": typeof audit_log_hooks_index;
  "audit_log/index": typeof audit_log_index;
  "audit_log/internal": typeof audit_log_internal;
  "audit_log/plugin": typeof audit_log_plugin;
  "audit_log/types": typeof audit_log_types;
  "audit_log/utils/index": typeof audit_log_utils_index;
  "audit_log/utils/normalize_path": typeof audit_log_utils_normalize_path;
  "audit_log/utils/parse_metadata": typeof audit_log_utils_parse_metadata;
  "audit_log/utils/request_meta": typeof audit_log_utils_request_meta;
  "audit_log/utils/retry": typeof audit_log_utils_retry;
  "audit_log/utils/sanitize": typeof audit_log_utils_sanitize;
  "audit_log/utils/severity": typeof audit_log_utils_severity;
  "audit_log/utils/validate_entry": typeof audit_log_utils_validate_entry;
  "audit_log/utils/validate_metadata": typeof audit_log_utils_validate_metadata;
  auth: typeof auth;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
