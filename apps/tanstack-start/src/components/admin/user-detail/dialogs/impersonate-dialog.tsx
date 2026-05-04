import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";

import { authClient } from "@/lib/auth/client";

import type { DialogBaseProps } from "../types";

export function ImpersonateDialog({
  open,
  onClose,
  userId,
  displayName,
}: DialogBaseProps) {
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.admin.impersonateUser({ userId });
      if (res.error) {
        throw new Error(res.error.message);
      }
      // The admin plugin switches the session cookie but does NOT refresh the
      // convex_jwt cookie. Hitting /get-session while authenticated triggers
      // the after-hook that re-issues the JWT cookie for the new session, so
      // the next page load authenticates as the impersonated user instead of
      // the admin.
      await authClient.getSession({ fetchOptions: { cache: "no-store" } });
      return res.data;
    },
    onSuccess: () => {
      toast.success(`Now impersonating ${displayName}`);
      onClose();
      window.location.assign("/");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to impersonate user",
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Impersonate user</DialogTitle>
          <DialogDescription>
            Your current session will be replaced with{" "}
            <strong>{displayName}</strong>'s session. You can stop impersonating
            from your account menu.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Impersonate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
