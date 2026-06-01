"use client";

import { useEffectEvent, useLayoutEffect } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

export function InitialThreadScrollInitializer({
  enabled,
  onReady,
}: {
  enabled: boolean;
  onReady: () => void;
}) {
  const { scrollRef } = useStickToBottomContext();
  const onReadyEvent = useEffectEvent(onReady);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const revealAfterPaint = () => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          onReadyEvent();
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
  }, [enabled, scrollRef]);

  return null;
}
