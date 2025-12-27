import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    password: v.string(),
  }),
  posts: defineTable({
    title: v.string(),
    content: v.string(),
  }),
});