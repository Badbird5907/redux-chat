"use client";

import type { AppFileRouter } from "@/upload";
import { createSiloReact } from "@silo-storage/sdk-react";

export const { useUpload, UploadButton, UploadDropzone } =
  createSiloReact<AppFileRouter>({
    endpoint: "/api/upload",
  });
