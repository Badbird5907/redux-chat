"use client";

import { useEffect, useRef, useState } from "react";

export function useFrameBufferedValue(value: string, enabled: boolean) {
  const [bufferedValue, setBufferedValue] = useState(value);
  const latestValueRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    latestValueRef.current = value;

    if (!enabled) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setBufferedValue(latestValueRef.current);
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [enabled, value]);

  return enabled ? bufferedValue : value;
}
