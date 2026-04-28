import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import { Textarea } from "@redux/ui/components/textarea";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({
  open,
  onOpenChange,
}: NewProjectDialogProps) {
  const router = useRouter();
  const createProject = useMutation(api.functions.projects.createProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = (next: boolean) => {
    if (submitting) return;
    if (!next) {
      setName("");
      setDescription("");
      setInstructions("");
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Project name is required");
      return;
    }

    setSubmitting(true);
    try {
      const { projectId } = await createProject({
        name: trimmedName,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
      });

      handleClose(false);
      void router.navigate({ to: "/projects/$id", params: { id: projectId } });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create project",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group related chats together with shared instructions and files.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-name">Name</Label>
            <Input
              id="new-project-name"
              autoFocus
              value={name}
              maxLength={120}
              placeholder="e.g. CSC165"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-description">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="new-project-description"
              value={description}
              maxLength={300}
              placeholder="What's this project about?"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-instructions">
              Instructions{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="new-project-instructions"
              value={instructions}
              rows={4}
              placeholder="Tailor Claude's responses for this project."
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={submitting} />}>
            Cancel
          </DialogClose>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Creating..." : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
