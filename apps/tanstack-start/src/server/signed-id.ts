import { createServerFn,createServerOnlyFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { env } from "@/env";
import { z } from "zod";

const generateSignedId = createServerOnlyFn(()=> {
  const id = nanoid();
  const sig = crypto.createHmac("sha256", env.INTERNAL_CONVEX_SECRET).update(id).digest("base64");
  return { id, sig };
});

export const generateSignedIds = createServerFn({ method: "POST" }).inputValidator(z.number().min(1).max(3))
  .handler(({ data }) => {
    return Array.from({ length: data }, generateSignedId);
  });