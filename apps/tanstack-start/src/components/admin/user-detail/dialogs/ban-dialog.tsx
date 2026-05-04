import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";

import { authClient } from "@/lib/auth/client";

import type { DialogBaseProps } from "../types";

const BAN_DURATIONS = [
  { value: "permanent", label: "Permanent", seconds: null },
  { value: "1d", label: "1 day", seconds: 60 * 60 * 24 },
  { value: "7d", label: "7 days", seconds: 60 * 60 * 24 * 7 },
  { value: "30d", label: "30 days", seconds: 60 * 60 * 24 * 30 },
] as const;

export function BanDialog({
  open,
  onClose,
  userId,
  displayName,
}: DialogBaseProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {open ? (
          <BanForm
            onClose={onClose}
            userId={userId}
            displayName={displayName}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BanForm({
  onClose,
  userId,
  displayName,
}: {
  onClose: () => void;
  userId: string;
  displayName: string;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<string>("permanent");

  const mutation = useMutation({
    mutationFn: async () => {
      const seconds =
        BAN_DURATIONS.find((d) => d.value === duration)?.seconds ?? null;
      const res = await authClient.admin.banUser({
        userId,
        banReason: reason.trim() || undefined,
        ...(seconds != null ? { banExpiresIn: seconds } : {}),
      });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: async () => {
      toast.success(`${displayName} has been banned`);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "user", "get", userId],
      });
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to ban user");
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="grid gap-6"
    >
      <DialogHeader>
        <DialogTitle>Ban user</DialogTitle>
        <DialogDescription>
          Block <strong>{displayName}</strong> from signing in. Active sessions
          will be revoked.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="admin-ban-reason">Reason (optional)</Label>
          <Input
            id="admin-ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Violated terms of service"
            disabled={mutation.isPending}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admin-ban-duration">Duration</Label>
          <Select
            value={duration}
            onValueChange={(value) => {
              if (typeof value === "string") {
                setDuration(value);
              }
            }}
            disabled={mutation.isPending}
          >
            <SelectTrigger id="admin-ban-duration" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BAN_DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        <Button type="submit" variant="destructive" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Ban user
        </Button>
      </DialogFooter>
    </form>
  );
}
