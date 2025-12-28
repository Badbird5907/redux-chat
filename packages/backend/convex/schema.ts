import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  posts: defineTable({
    title: v.string(),
    content: v.string(),
  }),
});
