"use server";
import { isAuthenticated } from "@/auth/server";
import { generateSignedId } from "@/lib/signed-id";

export const generateSignedIdsAction = async () => {
  const isAuthed = await isAuthenticated();
  if (!isAuthed) {
    throw new Error("Unauthorized");
  }
  const { id: threadId, sig: threadSig } = generateSignedId();
  const { id: messageId, sig: messageSig } = generateSignedId();
  const { id: assistantId, sig: assistantSig } = generateSignedId();
  return { thread: { id: threadId, sig: threadSig }, user: { id: messageId, sig: messageSig }, assistant: { id: assistantId, sig: assistantSig } }
}