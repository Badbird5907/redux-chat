import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"

export type SignedId = { id: string; sig: string; }
const SignedCidContext = createContext<{ fetchNew: (n: number) => Promise<void>, signedMessageIds?: SignedId[], removeIds: (n: number) => SignedId[] } | undefined>(undefined)

const DEFAULT_CACHE_SIZE = 3;

export const SignedCidProvider = ({ children }: { children: React.ReactNode }) => {
    const [signedMessageIds, setSignedMessageIds] = useState<SignedId[]>([])
    const isFetchingRef = useRef(false);

    const fetchNew = useCallback(async (n: number) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        
        try {
            const response = await fetch('/api/signed-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(n),
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch signed IDs');
            }
            
            const newIds = await response.json();
            setSignedMessageIds(prev => [...prev, ...newIds]);
        } catch (error) {
            console.error('Error fetching signed IDs:', error);
        } finally {
            isFetchingRef.current = false;
        }
    }, []);

    const removeIds = useCallback((n: number): SignedId[] => {
        const removed: SignedId[] = [];
        setSignedMessageIds(prev => {
            const toRemove = prev.slice(0, n);
            removed.push(...toRemove);
            return prev.slice(n);
        });
        return removed;
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
            const currentCount = ctx.signedMessageIds?.length ?? 0;
            
            if (currentCount < n) {
                // Not enough IDs, block and fetch
                await ctx.fetchNew(n - currentCount);
            }
            
            // Remove the requested IDs from cache
            const ids: SignedId[] = ctx.removeIds(n);
            
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