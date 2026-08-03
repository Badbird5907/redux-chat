import { Copy, ExternalLink } from "lucide-react";
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

import type { DeviceFlow } from "./use-provider-connections";

export function ChatGptDevicePanel({
  error,
  flow,
  onCancel,
  onRetry,
  secondsRemaining,
}: {
  error: string | null;
  flow: DeviceFlow;
  onCancel: () => void;
  onRetry: () => void;
  secondsRemaining: number;
}) {
  return (
    <div className="border-primary/30 bg-primary/5 space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">
        Authorize ChatGPT in the opened window
      </p>
      <div className="flex items-center gap-2">
        <code className="bg-background flex-1 rounded-md border px-3 py-2 text-center text-base font-semibold tracking-wider select-all">
          {flow.userCode}
        </code>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Copy ChatGPT authorization code"
          onClick={() => {
            void navigator.clipboard.writeText(flow.userCode);
            toast.success("Authorization code copied");
          }}
        >
          <Copy />
        </Button>
      </div>
      {error ? (
        <div
          className="border-destructive/35 bg-destructive/8 text-destructive rounded-md border px-3 py-2 text-xs"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          Expires in {secondsRemaining}s
        </span>
        <Button
          type="button"
          size="sm"
          variant="link"
          onClick={() =>
            window.open(flow.verificationUrl, "_blank", "noopener,noreferrer")
          }
        >
          Reopen authorization <ExternalLink />
        </Button>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {error ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Retry polling
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ChatGptConsentDialog({
  onConnect,
  onOpenChange,
  open,
}: {
  onConnect: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect your ChatGPT subscription</DialogTitle>
          <DialogDescription>
            This is usage-bearing authorization, not a Redux Chat sign-in.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
          <li>Requests can spend your available ChatGPT or Codex usage.</li>
          <li>Prompts and attachments pass through Redux Chat servers.</li>
          <li>
            Refreshable tokens are encrypted and shared across your Redux Chat
            sessions.
          </li>
          <li>
            This third-party integration relies on upstream behavior that may
            change without notice.
          </li>
          <li>Disconnecting deletes Redux Chat&apos;s stored tokens.</li>
        </ul>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConnect}>
            I understand, connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
