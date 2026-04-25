"use client";

import { useState } from "react";

const CHAT_SESSION_STORAGE_KEY = "chatSessionId";

export function useStableClientId() {
  const [clientId] = useState(() => {
    if (typeof window === "undefined") {
      return crypto.randomUUID();
    }

    const existingId = window.sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (existingId) {
      return existingId;
    }

    const newId = crypto.randomUUID();
    window.sessionStorage.setItem(CHAT_SESSION_STORAGE_KEY, newId);
    return newId;
  });

  return clientId;
}
