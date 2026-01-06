"use client"
import { generateSignedIdsAction } from "@/app/(app)/signed-id";
import { createContext, useContext, useEffect, useState, useCallback } from "react"

export type SignedId = { id: string; sig: string; }
const SignedCidContext = createContext<{ refresh: () => Promise<void>, thread?: SignedId; message?: { user: SignedId, assistant: SignedId } } | undefined>(undefined)

export const SignedCidProvider = ({ children }: { children: React.ReactNode }) => {
    const [signedThread, setSignedThread] = useState<SignedId | undefined>(undefined)
    const [signedMessage, setSignedMessage] = useState<{ user: SignedId, assistant: SignedId } | undefined>(undefined)

    const refresh = useCallback(async () => {
        const { thread, user, assistant } = await generateSignedIdsAction();
        setSignedThread(thread)
        setSignedMessage({ user, assistant })
    }, [])

    useEffect(() => {
        const init = async () => {
            await refresh();
        };
        void init();
    }, [refresh])
    return (
        <SignedCidContext.Provider value={{ refresh, thread: signedThread, message: signedMessage }}>
            {children}
        </SignedCidContext.Provider>
    )
}

export const useSignedCid = () => {
    const ctx = useContext(SignedCidContext);
    if (!ctx) throw new Error("Must be used in SignedCidContext")
    return {
        refresh: ctx.refresh,
        thread: ctx.thread,
        message: ctx.message,
        safeGetSignedThreadId: async () => {
            const id = ctx.thread ?? (await generateSignedIdsAction()).thread;
            void ctx.refresh();
            return { id: id.id, sig: id.sig, str: `${id.id}:${id.sig}` }
        },
        safeGetSignedMessageIds: async () => {
            const id = ctx.message ?? await generateSignedIdsAction();
            void ctx.refresh();
            return {
                user: { id: id.user.id, sig: id.user.sig, str: `${id.user.id}:${id.user.sig}` },
                assistant: { id: id.assistant.id, sig: id.assistant.sig, str: `${id.assistant.id}:${id.assistant.sig}` },
                str: `${id.user.id}.${id.user.sig}:${id.assistant.id}.${id.assistant.sig}`
            }
        }
    }
}