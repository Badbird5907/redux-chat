import type { OptionalRestArgsOrSkip} from "convex/react";
import { useQuery as useOriginalQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import type { FunctionReference } from "convex/server";

export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): Query["_returnType"] | undefined {
  const { isAuthenticated } = useConvexAuth();
  
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return useOriginalQuery(query, ...(isAuthenticated ? args : ['skip']));
}