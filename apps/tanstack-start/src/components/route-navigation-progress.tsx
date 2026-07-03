"use client";

import { useRouterState } from "@tanstack/react-router";

export function RouteNavigationProgress() {
  const isLoading = useRouterState({
    select: (state) => state.isLoading,
  });

  if (!isLoading) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <div className="bg-primary h-full w-1/3 animate-pulse rounded-r-full" />
    </div>
  );
}
