import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";

import { Button } from "@redux/ui/components/button";

import { ReduxChatBrand } from "@/components/auth/redux-chat-brand";

export function DefaultNotFoundPage() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  useEffect(() => {
    document.title = "Page not found · Redux Chat";
  }, []);

  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div
        className="bg-background pointer-events-none absolute inset-0 -z-20"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(70vh,36rem)] bg-[radial-gradient(ellipse_85%_55%_at_50%_-5%,hsl(var(--primary)/0.2),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[min(100%,48rem)] bg-[radial-gradient(circle_at_top_right,hsl(var(--muted-foreground)/0.1),transparent_68%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -z-10 h-px w-[min(90%,48rem)] -translate-x-1/2 bg-[linear-gradient(90deg,transparent,hsl(var(--border)/0.8),transparent)]"
        aria-hidden
      />

      <div className="relative w-full max-w-lg">
        <ReduxChatBrand />

        <div className="border-border/60 bg-card/85 relative overflow-hidden rounded-[1.75rem] border shadow-[0_24px_80px_-32px_hsl(0_0%_0%/0.35)] backdrop-blur-xl">
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--primary)/0.07)_0%,transparent_42%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-16 -bottom-24 size-64 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.12),transparent_70%)] blur-2xl"
            aria-hidden
          />

          <div className="relative px-6 pt-10 pb-8 sm:px-10 sm:pt-12 sm:pb-10">
            <p
              className="font-audiowide text-primary/85 mb-3 text-center text-6xl leading-none tracking-tight sm:text-7xl"
              aria-hidden
            >
              404
            </p>
            <p className="text-muted-foreground mb-1 text-center text-xs font-medium tracking-[0.22em] uppercase">
              Not found
            </p>

            <h1 className="text-foreground mt-5 text-center text-2xl font-semibold tracking-tight sm:text-[1.65rem]">
              We couldn&apos;t find that page
            </h1>
            <p className="text-muted-foreground mx-auto mt-3 max-w-md text-center text-[0.9375rem] leading-relaxed">
              The URL may be mistyped, the route changed, or this conversation
              or resource is no longer available.
            </p>

            <div className="border-border/70 bg-muted/35 mt-8 rounded-2xl border border-dashed px-4 py-3.5">
              <p className="text-muted-foreground text-center text-[0.65rem] font-semibold tracking-[0.18em] uppercase">
                Requested path
              </p>
              <output
                className="text-foreground mt-2 block text-center font-mono text-sm leading-snug [word-break:break-word] break-all"
                aria-live="polite"
              >
                {pathname || "/"}
              </output>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                render={<Link to="/" />}
                className="w-full sm:w-auto sm:min-w-[8.5rem]"
              >
                <Home className="size-4 shrink-0" />
                Home
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
                className="w-full sm:w-auto sm:min-w-[8.5rem]"
              >
                <ArrowLeft className="size-4 shrink-0" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
