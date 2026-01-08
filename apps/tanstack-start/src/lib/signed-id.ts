import "server-only"

import { nanoid } from "nanoid"
import crypto from "crypto"
import { env } from "../env"

export const generateSignedId = () => {
  const id = nanoid();

  const sig = crypto.createHmac("sha256", env.INTERNAL_CONVEX_SECRET).update(id).digest("base64");
  return { id, sig }
}
