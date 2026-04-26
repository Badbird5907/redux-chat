import { useQuery as useOriginalQuery } from "convex/react";
// import { useConvexAuth } from "convex/react";
import type { FunctionReference } from "convex/server";
import { authClient } from "@/lib/auth/client";

export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args?: Query["_args"],
  options?: { default?: Query["_returnType"], skip?: boolean }
): Query["_returnType"] | undefined {
  // const { isAuthenticated } = useConvexAuth();
  const { data: session } = authClient.useSession();

  const shouldSkip = Boolean(options?.skip) || !session;
  const result = useOriginalQuery(
    query,
    ...(shouldSkip ? ["skip"] : [args]),
  );

  return result ?? options?.default;
}