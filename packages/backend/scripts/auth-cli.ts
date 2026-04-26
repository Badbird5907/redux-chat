import { initAuth } from "../convex/auth";

export const auth = initAuth({} as unknown as Parameters<typeof initAuth>[0]);
