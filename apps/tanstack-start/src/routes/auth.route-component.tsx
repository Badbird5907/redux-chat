import { Outlet } from "@tanstack/react-router";

export function AuthRouteComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  );
}
