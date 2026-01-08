import { createServerFn } from "@tanstack/react-start";
import { getToken } from "@/lib/auth-server";
import { generateSignedId } from "@/lib/signed-id";

export const generateSignedIdsAction = createServerFn({ method: "POST" })
  .inputValidator((n: number) => n)
  .handler(async ({ data: n }) => {
    const token = await getToken();
    if (!token) {
      throw new Error("Unauthorized");
    }
    if (n > 3) throw new Error("Too many signed ids requested");
    return Array.from({ length: n }, () => generateSignedId());
  });
