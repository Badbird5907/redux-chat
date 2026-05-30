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

import type { AdminUserDetail, DialogBaseProps } from "../types";
import { authClient } from "@/lib/auth/client";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

function normalizeCommaRoles(value: string): string {
  return value
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .join(",");
}

function initialImageField(image: AdminUserDetail["image"]): string {
  return typeof image === "string" ? image.trim() : "";
}

export function EditProfileDialog({
  open,
  onClose,
  userId,
  displayName,
  user,
}: DialogBaseProps & { user: AdminUserDetail }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {open ? (
          <EditProfileForm
            onClose={onClose}
            userId={userId}
            displayName={displayName}
            user={user}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditProfileForm({
  onClose,
  userId,
  displayName,
  user,
}: {
  onClose: () => void;
  userId: string;
  displayName: string;
  user: AdminUserDetail;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useReducerState(() => user.name?.trim() ?? "");
  const [email, setEmail] = useReducerState(() => user.email.trim());
  const [imageUrl, setImageUrl] = useReducerState(() =>
    initialImageField(user.image),
  );
  const [role, setRole] = useReducerState(() => (user.role ?? "").trim());
  const [error, setError] = useReducerState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await authClient.admin.updateUser({
        userId,
        data: payload,
      });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: async () => {
      toast.success(`Profile updated for ${displayName}`);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin", "user", "get", userId],
        }),
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
      ]);
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError("Name is required.");
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!emailLooksValid) {
      setError("Enter a valid email address.");
      return;
    }

    const trimmedImage = imageUrl.trim();
    const imageBefore = typeof user.image === "string" ? user.image.trim() : "";

    const roleBefore = normalizeCommaRoles((user.role ?? "").trim());
    const roleAfter = normalizeCommaRoles(role.trim());

    const data: Record<string, unknown> = {};

    const nameBefore = (user.name ?? "").trim();
    if (trimmedName !== nameBefore) {
      data.name = trimmedName;
    }
    if (trimmedEmail !== user.email.trim().toLowerCase()) {
      data.email = trimmedEmail;
    }
    if (trimmedImage !== imageBefore) {
      data.image = trimmedImage.length > 0 ? trimmedImage : null;
    }
    if (roleAfter !== roleBefore) {
      data.role = roleAfter.length > 0 ? roleAfter : "user";
    }

    if (Object.keys(data).length === 0) {
      setError("No changes to save.");
      return;
    }

    mutation.mutate(data);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <DialogHeader>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>
          Update basic fields for <strong>{displayName}</strong>. Changing role
          requires the <strong>set-role</strong> admin permission.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="admin-edit-name">Display name</Label>
          <Input
            id="admin-edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mutation.isPending}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admin-edit-email">Email</Label>
          <Input
            id="admin-edit-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admin-edit-image">Image URL (optional)</Label>
          <Input
            id="admin-edit-image"
            type="url"
            inputMode="url"
            placeholder="https://..."
            autoComplete="off"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            disabled={mutation.isPending}
          />
          <p className="text-muted-foreground text-[11px]">
            Leave empty and save to remove the avatar URL.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admin-edit-role">Roles</Label>
          <Input
            id="admin-edit-role"
            placeholder="user or admin,user"
            autoComplete="off"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={mutation.isPending}
          />
          <p className="text-muted-foreground text-[11px]">
            Comma-separated (e.g. <code className="text-foreground">user</code>,{" "}
            <code className="text-foreground">admin</code>).
          </p>
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
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}
