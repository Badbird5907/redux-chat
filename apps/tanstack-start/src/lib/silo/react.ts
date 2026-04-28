"use client";

import { createSiloReact } from "@silo-storage/sdk-react";

import type { AppFileRouter } from "@/upload";

export const { useUpload, UploadButton, UploadDropzone } = createSiloReact<AppFileRouter>({
  endpoint: "/api/upload",
});
