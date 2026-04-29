import { initAuth } from "../auth";

// Export a static instance for Better Auth schema generation
export const auth = initAuth({} as unknown as Parameters<typeof initAuth>[0]);
