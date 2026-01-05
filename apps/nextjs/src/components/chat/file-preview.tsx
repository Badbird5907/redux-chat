"use client"

import { X, FileText } from "lucide-react"
import { Dialog, DialogContent, DialogHeader } from "@redux/ui/components/dialog"
import { Button } from "@redux/ui/components/button"

interface FilePreviewDialogProps {
  file: {
    id: string
    name: string
    type: string
    url?: string
  } | null
  onClose: () => void
}

export function FilePreviewDialog({ file, onClose }: FilePreviewDialogProps) {
  if (!file) return null

  const isImage = file.type.startsWith("image/")
  const isVideo = file.type.startsWith("video/")
  const isAudio = file.type.startsWith("audio/")
  const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-4 py-3 border-b border-border flex flex-row items-center">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
          </div>
          <div className="ml-auto">
            <Button variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        {/* Header */}

        {/* Content */}
        <div className="p-4 overflow-auto max-h-[calc(90vh-60px)]">
          {isImage && file.url && (
            <img src={file.url || "/placeholder.svg"} alt={file.name} className="w-full h-auto rounded-lg" />
          )}

          {isVideo && file.url && <video src={file.url} controls className="w-full h-auto rounded-lg" />}

          {isAudio && file.url && <audio src={file.url} controls className="w-full" />}

          {isPDF && file.url && (
            <div className="w-full h-[calc(90vh-100px)] rounded-lg overflow-hidden border border-border bg-muted/30">
              <object
                data={`${file.url}#view=FitH`}
                type="application/pdf"
                className="w-full h-full"
              >
                <iframe
                  src={`${file.url}#view=FitH`}
                  className="w-full h-full border-0"
                  title={file.name}
                >
                  <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">
                      This browser does not support inline PDFs.
                      <br />
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-medium hover:underline mt-2 inline-block"
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
              <FileText className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
