import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { useServerFn } from "@tanstack/react-start";
import { generateSignedIds } from "@/server/signed-id";

export type SignedId = { id: string; sig: string; }
const SignedCidContext = createContext<{ fetchNew: (n: number) => Promise<void>, signedMessageIds?: SignedId[], removeIds: (n: number) => SignedId[] } | undefined>(undefined)

const DEFAULT_CACHE_SIZE = 4;

export const SignedCidProvider = ({ children }: { children: React.ReactNode }) => {
    const [signedMessageIds, setSignedMessageIds] = useState<SignedId[]>([])
    const idsRef = useRef<SignedId[]>([]);
    const isFetchingRef = useRef(false);
    const fetchPromiseRef = useRef<Promise<void> | null>(null);

    const generateSignedIdsFn = useServerFn(generateSignedIds)
    const fetchNew = useCallback(async (n: number) => {
        // If already fetching, wait for that fetch to complete
        if (fetchPromiseRef.current) {
            await fetchPromiseRef.current;
            return;
        }
        
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        
        const promise = (async () => {
            try {
                const newIds = await generateSignedIdsFn({ data: n });
                idsRef.current = [...idsRef.current, ...newIds];
                setSignedMessageIds(idsRef.current);
            } finally {
                isFetchingRef.current = false;
                fetchPromiseRef.current = null;
            }
        })();
        
        fetchPromiseRef.current = promise;
        await promise;
    }, [generateSignedIdsFn]);

    const removeIds = useCallback((n: number): SignedId[] => {
        const toRemove = idsRef.current.slice(0, n);
        idsRef.current = idsRef.current.slice(n);
        setSignedMessageIds(idsRef.current);
        return toRemove;
    }, []);

    // Pre-load 3 IDs on mount
    useEffect(() => {
        void fetchNew(DEFAULT_CACHE_SIZE);
    }, [fetchNew]);

    return (
        <SignedCidContext.Provider value={{ fetchNew, signedMessageIds, removeIds }}>
            {children}
        </SignedCidContext.Provider>
    )
}

export const useSignedCid = () => {
    const ctx = useContext(SignedCidContext);
    if (!ctx) throw new Error("Must be used in SignedCidContext")
    
    return {
        fetchNew: ctx.fetchNew,
        signedMessageIds: ctx.signedMessageIds,
        safeGetSignedId: async (n = 1) => {
            // Check if we have enough IDs in cache
            let currentCount = ctx.signedMessageIds?.length ?? 0;
            
            if (currentCount < n) {
                // Not enough IDs, block and fetch
                const needed = n - currentCount;
                await ctx.fetchNew(needed);
                
                // After fetch, check if we have enough now
                currentCount = ctx.signedMessageIds?.length ?? 0;
                if (currentCount < n) {
                    console.error("Failed to get enough IDs after fetch", {
                        requested: n,
                        available: currentCount,
                        needed
                    });
                    throw new Error(`Failed to get enough IDs. Requested ${n}, available ${currentCount}`);
                }
            }
            
            // Remove the requested IDs from cache
            const ids: SignedId[] = ctx.removeIds(n);
            
            if (ids.length < n) {
                console.error("removeIds returned fewer IDs than requested", {
                    requested: n,
                    received: ids.length
                });
                throw new Error(`Failed to remove enough IDs. Requested ${n}, got ${ids.length}`);
            }
            
            // Non-blocking: replenish the cache back to default size
            const remainingCount = (ctx.signedMessageIds?.length ?? 0);
            if (remainingCount < DEFAULT_CACHE_SIZE) {
                ctx.fetchNew(DEFAULT_CACHE_SIZE - remainingCount).catch(err => {
                    console.error("Failed to replenish ID cache:", err);
                });
            }
            
            return ids.map(sid => ({
                ...sid,
                str: `${sid.id}:${sid.sig}`
            }));
        }
    }
}