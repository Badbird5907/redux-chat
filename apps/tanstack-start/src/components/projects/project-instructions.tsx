import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import { Textarea } from "@redux/ui/components/textarea";

interface ProjectInstructionsProps {
  projectId: string;
  instructions: string | undefined;
}

export function ProjectInstructions({
  projectId,
  instructions,
}: ProjectInstructionsProps) {
  const updateProject = useMutation(api.functions.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(instructions ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProject({
        projectId,
        patch: { instructions: draft },
      });
      setEditing(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save instructions",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Instructions</span>
          {!instructions && !editing && (
            <span className="text-muted-foreground text-xs">
              Add instructions to tailor Claude's responses
            </span>
          )}
        </div>
        {!editing && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Edit instructions"
            onClick={() => {
              setDraft(instructions ?? "");
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              ref={textareaRef}
              rows={6}
              value={draft}
              placeholder="Tailor Claude's responses for this project..."
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setDraft(instructions ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : instructions ? (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {instructions}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
