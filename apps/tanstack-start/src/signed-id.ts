"use server";
import { isAuthenticated } from "@/auth/server";
import { generateSignedId } from "@/lib/signed-id";

export const generateSignedIdsAction = async (n: number) => {
  const isAuthed = await isAuthenticated();
  if (!isAuthed) {
    throw new Error("Unauthorized");
  }
  if (n > 3) throw new Error("Too many signed ids requested");
  return Array.from({ length: n }, () => generateSignedId());
}