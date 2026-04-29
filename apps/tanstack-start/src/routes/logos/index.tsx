import { createFileRoute } from "@tanstack/react-router";

import { LOGO_SHOWCASE } from "@/components/logos/registry";

export const Route = createFileRoute("/logos/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">Logos</h1>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {LOGO_SHOWCASE.map(({ name, Logo, LogoWhite, surface }) => (
          <li
            key={name}
            className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
          >
            <span className="text-center text-sm font-medium text-zinc-300">
              {name}
            </span>
            <div className="flex items-stretch justify-center gap-3">
              <div className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs text-zinc-500">Color</span>
                <div
                  className={
                    surface === "dark"
                      ? "flex h-20 w-full max-w-26 items-center justify-center rounded-lg bg-zinc-950 p-3 ring-1 ring-zinc-800"
                      : "flex h-20 w-full max-w-26 items-center justify-center rounded-lg bg-white p-3 shadow-inner"
                  }
                >
                  <Logo
                    className={
                      surface === "light"
                        ? "max-h-full max-w-full text-zinc-900"
                        : "max-h-full max-w-full"
                    }
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs text-zinc-500">White</span>
                <div className="flex h-20 w-full max-w-26 items-center justify-center rounded-lg p-3 ring-1 ring-zinc-800">
                  <LogoWhite className="max-h-full max-w-full" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
