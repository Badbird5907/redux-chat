"use client"

import { X, FileText } from "lucide-react"
import { Dialog, DialogContent } from "@redux/ui/components/dialog"

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
  const isPDF = file.type === "application/pdf"

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-auto max-h-[calc(90vh-60px)]">
          {isImage && file.url && (
            <img src={file.url || "/placeholder.svg"} alt={file.name} className="w-full h-auto rounded-lg" />
          )}

          {isVideo && file.url && <video src={file.url} controls className="w-full h-auto rounded-lg" />}

          {isAudio && file.url && <audio src={file.url} controls className="w-full" />}

          {isPDF && file.url && (
            <iframe src={file.url} className="w-full h-[calc(90vh-100px)] rounded-lg" title={file.name} />
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
