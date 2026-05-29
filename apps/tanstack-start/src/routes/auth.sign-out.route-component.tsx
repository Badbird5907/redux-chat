import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth/client";

export function SignOutPage() {
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
    <div className="flex flex-col items-center justify-center space-y-4">
      <Loader2 className="text-primary size-8 animate-spin" />
      <p className="text-muted-foreground text-sm">Signing out...</p>
    </div>
  );
}
