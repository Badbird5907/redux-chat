import type { FunctionReference } from "convex/server";
import { useConvexAuth, useQuery as useOriginalQuery } from "convex/react";

export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args?: Query["_args"],
  options?: { default?: Query["_returnType"]; skip?: boolean },
): Query["_returnType"] | undefined {
  const { isLoading, isAuthenticated } = useConvexAuth();

  const shouldSkip = Boolean(options?.skip) || isLoading || !isAuthenticated;
  const result = useOriginalQuery(query, ...(shouldSkip ? ["skip"] : [args]));

  return result ?? options?.default;
}
