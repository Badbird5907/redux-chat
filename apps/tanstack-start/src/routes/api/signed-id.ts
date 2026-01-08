import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { isAuthenticated } from "@/lib/auth-server";
import { generateSignedId } from "@/lib/signed-id";

const generateSignedIds = createServerFn({ method: 'POST' })
  .inputValidator((data: number) => data)
  .handler(async ({ data: n }) => {
    const isAuthed = await isAuthenticated();
    if (!isAuthed) {
      throw new Error("Unauthorized");
    }
    if (n > 3) throw new Error("Too many signed ids requested");
    return Array.from({ length: n }, () => generateSignedId());
  });

export const Route = createFileRoute('/api/signed-id')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const n = await request.json();
        const result = await generateSignedIds({ data: n });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
})