import type { PreviewableFile } from "./input/types";

/**
 * Cross-component request to preview a file. The active chat decides how to
 * surface it (adjacent side panel for supported text files on desktop,
 * otherwise the preview dialog), so model-presented files and the Files sheet
 * can reuse the same preview flow as user attachments.
 */
export const OPEN_FILE_PREVIEW_EVENT = "redux:open-file-preview";

export function requestFilePreview(file: PreviewableFile) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<PreviewableFile>(OPEN_FILE_PREVIEW_EVENT, {
      detail: file,
    }),
  );
}
