import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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

export function DeleteDialog({
  open,
  onClose,
  userId,
  displayName,
  confirmValue,
}: DialogBaseProps & { confirmValue: string }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {open ? (
          <DeleteForm
            onClose={onClose}
            userId={userId}
            displayName={displayName}
            confirmValue={confirmValue}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeleteForm({
  onClose,
  userId,
  displayName,
  confirmValue,
}: {
  onClose: () => void;
  userId: string;
  displayName: string;
  confirmValue: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmInput, setConfirmInput] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.admin.removeUser({ userId });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: async () => {
      toast.success(`${displayName} has been deleted`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
      void navigate({ to: "/admin/users" });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    },
  });

  const canDelete = confirmInput === confirmValue && !mutation.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canDelete) {
          mutation.mutate();
        }
      }}
      className="grid gap-6"
    >
      <DialogHeader>
        <DialogTitle>Delete user</DialogTitle>
        <DialogDescription>
          This permanently removes <strong>{displayName}</strong> from the
          application. This action cannot be undone.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="admin-delete-confirm">
          Type{" "}
          <code className="bg-muted text-foreground rounded px-1 py-0.5 text-xs">
            {confirmValue}
          </code>{" "}
          to confirm
        </Label>
        <Input
          id="admin-delete-confirm"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={mutation.isPending}
        />
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
        <Button type="submit" variant="destructive" disabled={!canDelete}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Delete user
        </Button>
      </DialogFooter>
    </form>
  );
}
