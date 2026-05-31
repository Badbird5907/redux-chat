import type { AllocatedSignedId } from "@/components/chat/signed-id-allocator";
import type { ReactNode } from "react";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useServerFn } from "@tanstack/react-start";

import { SignedIdQueueAllocator } from "@/components/chat/signed-id-allocator";
import { generateSignedIds } from "@/server/signed-id";

interface SignedIdAllocator {
  allocate: (count: number) => Promise<AllocatedSignedId[]>;
  prefetch: (minimumCount?: number) => Promise<void>;
}

const SignedCidContext = createContext<SignedIdAllocator | undefined>(
  undefined,
);

const DEFAULT_CACHE_SIZE = 4;
const MAX_BATCH_SIZE = 4;

export const SignedCidProvider = ({ children }: { children: ReactNode }) => {
  const generateSignedIdsFn = useServerFn(generateSignedIds);
  const allocatorRef = useRef<SignedIdQueueAllocator | null>(null);

  allocatorRef.current ??= new SignedIdQueueAllocator(
    (count) => generateSignedIdsFn({ data: count }),
    {
      defaultCacheSize: DEFAULT_CACHE_SIZE,
      maxBatchSize: MAX_BATCH_SIZE,
    },
  );

  const getAllocator = useCallback(() => {
    const allocator = allocatorRef.current;
    if (!allocator) {
      throw new Error("Signed ID allocator is not initialized");
    }

    return allocator;
  }, []);

  const fetchChunk = useCallback(
    async (minimumCount = DEFAULT_CACHE_SIZE) => {
      await getAllocator().prefetch(minimumCount);
    },
    [getAllocator, DEFAULT_CACHE_SIZE],
  );

  const allocate = useCallback(
    async (count: number): Promise<AllocatedSignedId[]> => {
      return getAllocator().allocate(count);
    },
    [getAllocator],
  );

  useEffect(() => {
    void fetchChunk(DEFAULT_CACHE_SIZE).catch((error: unknown) => {
      console.error("Failed to warm signed ID cache", { error });
    });
  }, [fetchChunk]);

  const value = useMemo(
    () => ({
      allocate,
      prefetch: fetchChunk,
    }),
    [allocate, fetchChunk],
  );

  return (
    <SignedCidContext.Provider value={value}>
      {children}
    </SignedCidContext.Provider>
  );
};

export const useSignedCid = () => {
  const ctx = use(SignedCidContext);
  if (!ctx) throw new Error("Must be used in SignedCidContext");

  return ctx;
};
