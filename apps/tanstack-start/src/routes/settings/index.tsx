import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <h1 className="text-2xl font-semibold tracking-tight">
        General Settings
      </h1>
    </div>
  );
}
