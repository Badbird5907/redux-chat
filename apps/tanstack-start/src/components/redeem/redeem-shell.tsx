import type { ReactNode } from "react";

export function RedeemShell({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full min-w-0">{children}</div>
      </div>
    </main>
  );
}
