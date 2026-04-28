import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import { Textarea } from "@redux/ui/components/textarea";

interface ProjectDescriptionProps {
  projectId: string;
  description: string | undefined;
}

export function ProjectDescription({
  projectId,
  description,
}: ProjectDescriptionProps) {
  const updateProject = useMutation(api.functions.projects.updateProject);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(description ?? "");
  }, [description]);

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
        patch: { description: draft },
      });
      setEditing(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save description",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Description</span>
          {!description && !editing && (
            <span className="text-muted-foreground text-xs">
              Summarize what this project is for
            </span>
          )}
        </div>
        {!editing && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Edit description"
            onClick={() => setEditing(true)}
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
              rows={4}
              value={draft}
              placeholder="Brief summary shown under the project title..."
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setDraft(description ?? "");
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
        ) : description ? (
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {description}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
