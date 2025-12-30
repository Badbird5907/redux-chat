import { defineSchema } from "convex/server";
import { zodTable } from "./zod";

import { threadSchema, messageSchema } from "@redux/types/zod/threads";
const threadsTable = zodTable("threads", threadSchema);
const messagesTable = zodTable("messages", messageSchema);

export default defineSchema({
  threads: threadsTable
    .table()
      .index("by_updated", ["updatedAt"])
    .index("by_status", ["status"]),
  
  messages: messagesTable
    .table()
    .index("by_thread", ["threadId", "_creationTime"])
    .index("by_parent", ["parentId", "_creationTime"])
    .index("by_thread_and_parent", ["threadId", "parentId"]),
});
