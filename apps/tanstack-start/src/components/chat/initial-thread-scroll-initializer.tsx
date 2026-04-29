"use client";

import { useLayoutEffect } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

interface InitialThreadScrollInitializerProps {
  enabled: boolean;
  onReady: () => void;
}

export function InitialThreadScrollInitializer({
  enabled,
  onReady,
}: InitialThreadScrollInitializerProps) {
  const { scrollRef } = useStickToBottomContext();

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const revealAfterPaint = () => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          onReady();
        }
      });
    };

    const scrollElement = scrollRef.current;

    if (!scrollElement) {
      const animationFrame = requestAnimationFrame(() => {
        const nextScrollElement = scrollRef.current;

        if (nextScrollElement) {
          nextScrollElement.scrollTop = nextScrollElement.scrollHeight;
        }

        revealAfterPaint();
      });

      return () => {
        cancelled = true;
        cancelAnimationFrame(animationFrame);
      };
    }

    scrollElement.scrollTop = scrollElement.scrollHeight;
    revealAfterPaint();

    return () => {
      cancelled = true;
    };
  }, [enabled, onReady, scrollRef]);

  return null;
}
