import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthQuery } from "@/lib/auth/server";

import { embedTexts } from "./embed-client";
import { getVectorStore } from "./index";
import type { RetrievedChunk } from "./vector-store";

export interface RetrieveProjectContextInput {
  chatProjectId: string;
  query: string;
  k?: number;
}

export interface RetrieveProjectContextResult {
  chunks: RetrievedChunk[];
}

const DEFAULT_K = 6;

export interface RetrieveProjectContextForUserInput {
  userId: string;
  chatProjectId: string;
  query: string;
  k?: number;
}

export async function retrieveProjectContextForUser(
  input: RetrieveProjectContextForUserInput,
): Promise<RetrieveProjectContextResult> {
  const query = input.query.trim();
  if (!query) {
    return { chunks: [] };
  }

  const [vector] = await embedTexts([query]);
  if (!vector) {
    return { chunks: [] };
  }

  const chunks = await getVectorStore().search({
    userId: input.userId,
    chatProjectId: input.chatProjectId,
    vector,
    k: input.k ?? DEFAULT_K,
  });

  return { chunks };
}

/**
 * Embeds the query and asks the vector store for the top-K chunks scoped to a
 * chat project. Returns an empty result on auth failure or empty query.
 *
 * Called from the `/api/chat` POST handler when a thread is part of a project.
 * Kept as a plain async function (no createServerFn) because the consumer
 * already runs server-side and we want to avoid the round-trip overhead.
 */
export async function retrieveProjectContext(
  input: RetrieveProjectContextInput,
): Promise<RetrieveProjectContextResult> {
  const { userId } = await fetchAuthQuery(
    api.functions.user.getCurrentUserId,
    {},
  );
  if (!userId) {
    return { chunks: [] };
  }

  return retrieveProjectContextForUser({
    userId,
    chatProjectId: input.chatProjectId,
    query: input.query,
    k: input.k ?? DEFAULT_K,
  });
}
