"use client";

import { useEffect, useState } from "react";

const CHAT_SESSION_STORAGE_KEY = "chatSessionId";
const HYDRATION_CLIENT_ID = "hydrating";

export function useStableClientId() {
  const [clientId, setClientId] = useState(HYDRATION_CLIENT_ID);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      let existingId: string | null = null;

      try {
        existingId = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
      } catch {
        existingId = null;
      }

      if (existingId) {
        setClientId(existingId);
        return;
      }

      const newId = crypto.randomUUID();
      setClientId(newId);

      try {
        window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, newId);
      } catch {
        // Best effort session continuity.
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return clientId;
}
