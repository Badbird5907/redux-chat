import { X, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@redux/ui/components/dialog";
import { Button } from "@redux/ui/components/button";

interface FilePreviewDialogProps {
  file: {
    id: string;
    name: string;
    type: string;
    url?: string;
    convertedToPdf?: boolean;
  } | null;
  onClose: () => void;
}

export function FilePreviewDialog({ file, onClose }: FilePreviewDialogProps) {
  if (!file) return null;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/"); // we don't support audio files yet but it's here
  const isPDF =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const extension = file.name.split(".").pop();

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-6xl"
        showCloseButton={false}
      >
        <DialogHeader className="border-border flex flex-row items-start gap-4 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-foreground truncate text-sm font-medium">
                {file.name}
              </span>
            </div>
            {file.convertedToPdf && (
              <>
                <p className="text-muted-foreground mt-1.5 max-w-none text-xs leading-relaxed">
                  This file was automatically converted to PDF for model
                  compatibility.
                </p>
                <p className="text-muted-foreground mt-1.5 max-w-none text-xs leading-relaxed">
                  Use models that natively support {extension} files for best results.
                </p>
              </>
            )}
          </div>
          <div className="shrink-0 self-start">
            <Button variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(90vh-60px)] overflow-auto px-4 pb-4 pt-4">
          {isImage && file.url && (
            <img
              src={file.url || "/placeholder.svg"}
              alt={file.name}
              className="h-auto w-full rounded-lg"
            />
          )}

          {isVideo && file.url && (
            <video
              src={file.url}
              controls
              className="h-auto w-full rounded-lg"
            />
          )}

          {isAudio && file.url && (
            <audio src={file.url} controls className="w-full" />
          )}

          {isPDF && file.url && (
            <div className="border-border bg-muted/30 h-[calc(90vh-100px)] w-full overflow-hidden rounded-lg border">
              <object
                data={`${file.url}#view=FitH`}
                type="application/pdf"
                className="h-full w-full"
              >
                <iframe
                  src={`${file.url}#view=FitH`}
                  className="h-full w-full border-0"
                  title={file.name}
                >
                  <div className="flex h-full flex-col items-center justify-center p-12 text-center">
                    <FileText className="text-muted-foreground mb-3 h-12 w-12" />
                    <p className="text-muted-foreground text-sm">
                      This browser does not support inline PDFs.
                      <br />
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary mt-2 inline-block font-medium hover:underline"
                      >
                        Click here to view the PDF
                      </a>
                    </p>
                  </div>
                </iframe>
              </object>
            </div>
          )}

          {!isImage && !isVideo && !isAudio && !isPDF && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="text-muted-foreground mb-3 h-12 w-12" />
              <p className="text-muted-foreground text-sm">
                Preview not available for this file type
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
