import { Authenticated as AuthenticatedComponent } from "convex/react";

export function Authenticated({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedComponent>
      {children}
    </AuthenticatedComponent>
  );
}