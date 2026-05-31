import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth/client";

function SignOutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const signOut = async () => {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            void navigate({ to: "/", reloadDocument: true });
          },
        },
      });
    };
    void signOut();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center gap-y-4">
      <Loader2 className="text-primary size-8 animate-spin" />
      <p className="text-muted-foreground text-sm">Signing out&hellip;</p>
    </div>
  );
}

export const Route = createFileRoute("/auth/sign-out")({
  component: SignOutPage,
});
