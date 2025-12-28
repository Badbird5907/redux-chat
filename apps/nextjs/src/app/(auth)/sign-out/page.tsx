"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/client";
import { Loader2 } from "lucide-react";

export default function SignOutPage() {
  const router = useRouter();

  React.useEffect(() => {
    const signOut = async () => {
      await authClient.signOut({
        fetchOptions: {
            onSuccess: () => {
                router.push("/");
                router.refresh();
            }
        }
      });
    };
    void signOut();
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm">Signing out...</p>
    </div>
  );
}

