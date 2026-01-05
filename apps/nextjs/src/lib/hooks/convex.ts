// eslint-disable-next-line no-restricted-imports
import { useQuery as useOriginalQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import type { FunctionReference } from "convex/server";

export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args?: Query["_args"],
  options?: { default?: Query["_returnType"], skip?: boolean }
): Query["_returnType"] | undefined {
  const { isAuthenticated } = useConvexAuth();

  const shouldSkip = options?.skip ?? !isAuthenticated;
  const result = useOriginalQuery(query, ...(shouldSkip ? ["skip"] : [args]));
  return result ?? options?.default;
}