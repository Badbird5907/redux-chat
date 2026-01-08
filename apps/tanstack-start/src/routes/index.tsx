import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Hello World</h1>
    </div>
  );
}
