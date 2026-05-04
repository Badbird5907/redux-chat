import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export function UnbanDialog({
  open,
  onClose,
  userId,
  displayName,
}: DialogBaseProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.admin.unbanUser({ userId });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: async () => {
      toast.success(`${displayName} has been unbanned`);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "user", "get", userId],
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to unban user");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unban user</DialogTitle>
          <DialogDescription>
            Lift the ban on <strong>{displayName}</strong>. They'll be able to
            sign in again immediately.
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
            Unban user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
