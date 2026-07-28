import { createFileRoute } from "@tanstack/react-router";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthQuery, getRequestUserIdFromHeaders } from "@/lib/auth/server";
import { downloadPrivateSkillFile } from "@/server/skills/storage";

const INLINE_MIME_TYPES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/markdown",
  "text/plain",
]);

function safeFileName(path: string) {
  return (path.split("/").at(-1) ?? "skill-file").replace(/["\r\n]/g, "_");
}

export const Route = createFileRoute("/api/skills/files/$skillFileId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const userId = await getRequestUserIdFromHeaders(request.headers);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const file = await fetchAuthQuery(
          api.functions.skills.backend_getSkillFile,
          {
            secret: env.INTERNAL_CONVEX_SECRET,
            userId,
            skillFileId: params.skillFileId,
          },
        ).catch(() => undefined);
        if (!file) return new Response("Not found", { status: 404 });
        const source = await downloadPrivateSkillFile({
          accessKey: file.accessKey,
          fileKeyId: file.fileKeyId,
          fileName: safeFileName(file.path),
        });
        const download =
          new URL(request.url).searchParams.get("download") === "1";
        const disposition =
          download || !INLINE_MIME_TYPES.has(file.mimeType)
            ? "attachment"
            : "inline";
        return new Response(source.body, {
          status: source.status,
          headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `${disposition}; filename="${safeFileName(file.path)}"`,
            "Content-Length": String(file.size),
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Content-Type": file.mimeType,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
