import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

export const getPosts = query({
    args: {},
    handler: async ({ db }) => {
        return (await db.query("posts").collect()).sort((a, b) => b._creationTime - a._creationTime);
    }
})

export const createPost = mutation({
    args: {
        title: v.string(),
        content: v.string(),
    },
    handler: async ({ db }, { title, content }) => {
        return db.insert("posts", { title, content });
    }
})