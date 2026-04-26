"use client";

import { createSiloReact } from "@silo-storage/sdk-react";

import type { AppFileRouter } from "@/upload";

export const { useUpload } = createSiloReact<AppFileRouter>({
  endpoint: "/api/upload",
});
