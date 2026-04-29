import { useMutation, useQuery } from "convex/react";
import { AlertCircle, FileText, Loader2, Plus, Trash } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@redux/ui/components/progress";

import { UploadButton, UploadDropzone, useUpload } from "@/lib/silo/react";

interface ProjectFilesProps {
  projectId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectFiles({ projectId }: ProjectFilesProps) {
  const files = useQuery(api.functions.projects.getProjectFiles, { projectId });
  const deleteFile = useMutation(api.functions.projects.deleteProjectFile);

  const upload = useUpload({
    endpoint: "projectAttachment",
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteFile({ attachmentId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete file",
      );
    }
  };

  return (
    <UploadDropzone
      upload={upload}
      input={{ chatProjectId: projectId }}
      disabled={upload.isUploading}
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <span className="text-sm font-medium">Files</span>
          <UploadButton
            upload={upload}
            input={{ chatProjectId: projectId }}
            disabled={upload.isUploading}
          >
            <Button size="icon-sm" variant="ghost" aria-label="Upload file">
              <Plus className="size-4" />
            </Button>
          </UploadButton>
        </CardHeader>
        <CardContent className="space-y-3">
          {upload.isUploading && (
            <div className="space-y-2">
              <Progress
                value={upload.progress.aggregatePercent}
                aria-label="Upload progress"
                className="flex-col gap-2"
              >
                <div className="flex w-full min-w-0 items-center gap-2">
                  <ProgressLabel className="text-muted-foreground max-w-[min(100%,20rem)] shrink truncate text-xs font-normal">
                    Uploading
                    {upload.currentUploadingFile
                      ? ` · ${upload.currentUploadingFile.name}`
                      : "…"}
                  </ProgressLabel>
                  <ProgressValue className="shrink-0" />
                </div>
              </Progress>
            </div>
          )}
          {files === undefined ? (
            <p className="text-muted-foreground text-sm">Loading files...</p>
          ) : files.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No files yet. Click + to add reference material to this project.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {files.map((file) => {
                const isIndexing =
                  file.embeddingStatus === "queued" ||
                  file.embeddingStatus === "indexing" ||
                  file.embeddingStatus === undefined;
                const isFailed = file.embeddingStatus === "failed";
                return (
                  <li
                    key={file.attachmentId}
                    className="border-border bg-background/40 group flex items-center gap-2 rounded-lg border px-3 py-2"
                  >
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{file.fileName}</span>
                      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        {formatFileSize(file.size)}
                        {isIndexing && (
                          <span className="text-muted-foreground inline-flex items-center gap-1">
                            <Loader2 className="size-3 animate-spin" />
                            Indexing…
                          </span>
                        )}
                        {isFailed && (
                          <span
                            className="text-destructive inline-flex items-center gap-1"
                            title={file.embeddingError ?? "Indexing failed"}
                          >
                            <AlertCircle className="size-3" />
                            Indexing failed
                          </span>
                        )}
                      </span>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${file.fileName}`}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => void handleDelete(file.attachmentId)}
                    >
                      <Trash className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </UploadDropzone>
  );
}
