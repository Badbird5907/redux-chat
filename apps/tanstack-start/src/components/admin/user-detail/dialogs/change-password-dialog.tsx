import { useState } from "react";
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
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";

import type { DialogBaseProps } from "../types";
import { authClient } from "@/lib/auth/client";

export function ChangePasswordDialog({
  open,
  onClose,
  userId,
  displayName,
}: DialogBaseProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {open ? (
          <ChangePasswordForm
            onClose={onClose}
            userId={userId}
            displayName={displayName}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({
  onClose,
  userId,
  displayName,
}: {
  onClose: () => void;
  userId: string;
  displayName: string;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await authClient.admin.setUserPassword({
        userId,
        newPassword: password,
      });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["admin", "user", "get", userId],
      });
      toast.success(`Password updated for ${displayName}`);
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to set password");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    mutation.mutate(newPassword);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>
          Set a new password for <strong>{displayName}</strong>. The user will
          need to use this password on their next sign-in.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="admin-new-password">New password</Label>
          <Input
            id="admin-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={mutation.isPending}
            required
            minLength={8}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admin-confirm-password">Confirm password</Label>
          <Input
            id="admin-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={mutation.isPending}
            required
            minLength={8}
          />
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Update password
        </Button>
      </DialogFooter>
    </form>
  );
}
