"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import { ChatInput } from "./input";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@/lib/hooks/convex";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage, TextUIPart } from "ai";
import { api } from "@redux/backend/convex/_generated/api";
import type { Id } from "@redux/backend/convex/_generated/dataModel";
// Type guard to narrow part types to TextUIPart
const isTextPart = (part: { type: string }): part is TextUIPart => part.type === "text";

type ConvexMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: unknown;
  status: "generating" | "completed" | "failed";
  createdAt: number;
}

export function PreloadedChat({ preload, threadId }: { preload: (typeof api.functions.threads.getThreadMessages)["_returnType"], threadId: string }) {
  const convexMessages = useQuery(api.functions.threads.getThreadMessages, { threadId: threadId as Id<"threads">}, { default: preload, skip: false })
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(threadId);
  
  return <Chat threadId={currentThreadId} setThreadId={(id) => setCurrentThreadId(id)} convexMessages={convexMessages} />;
}
export function EmptyChat() {
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const convexMessages = useQuery(api.functions.threads.getThreadMessages, { threadId: threadId as Id<"threads">}, { default: undefined, skip: !threadId })
  return <Chat threadId={threadId} setThreadId={(id) => setThreadId(id)} convexMessages={convexMessages} />;
}

export function Chat({ threadId, setThreadId, convexMessages }: { threadId: string | undefined, setThreadId: (threadId: string | undefined) => void, convexMessages: ConvexMessage[] | undefined }) {
  console.log({ convexMessages})
  const previousConvexMessagesRef = useRef<{
    id: string;
    role: "user" | "assistant" | "system";
    content: unknown;
    status: "generating" | "completed" | "failed";
    createdAt: number;
  }[] | undefined>(undefined);
  
  const existingMessages: UIMessage[] = useMemo(() => {
    return convexMessages?.filter(m => m.status !== "generating").map(m => {
      if (typeof m.content === 'string') {
        return {
          ...m,
          parts: [{ type: "text" as const, text: m.content }],
          content: undefined,
        }
      } else if (Array.isArray(m.content)) {
        return {
          ...m,
          parts: m.content,
          content: undefined,
        };
      } else {
        return {
          ...m,
          parts: [{ type: "text" as const, text: "" }],
          content: undefined,
        }
      }
    }) ?? []; // exclude generating messages
  }, [convexMessages])

  const { messages: streamingMessages, status, sendMessage, resumeStream } = useChat({
    messages: existingMessages,
    id: threadId,
    resume: true,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      
    }),
  });


  useEffect(() => {
    // this should fire when another client adds a message
    if (convexMessages !== previousConvexMessagesRef.current) {
      const newMessages = convexMessages?.filter(m => !previousConvexMessagesRef.current?.some(cm => cm.id === m.id));
      if (newMessages && previousConvexMessagesRef.current) {
        console.log("New messages:", newMessages);
        setTimeout(() => {
          void resumeStream();
          console.log("Resumed stream");
        }, 500);
      }
      previousConvexMessagesRef.current = convexMessages;
    }
    // if (convexMessages && !previousConvexMessagesRef.current) {
    //   setTimeout(() => {
    //     void resumeStream();
    //   }, 500);
    // }
  }, [convexMessages, resumeStream]);


  console.log("=====")
  console.dir(streamingMessages);
  console.dir(existingMessages);
  console.log("=====")


  return (
    <div className="h-full flex flex-col overflow-hidden">
      {existingMessages.map(m => (
        <div key={m.id}>
          <div>{m.parts.filter(isTextPart).map(p => p.text).join("")}</div>
        </div>
      ))}
      {/* only show the messages that aren't in the convexMessages (should be max. 1) */}
      {streamingMessages.filter(m => !existingMessages.some(em => em.id === m.id)).map(m => (
        <div key={m.id}>
          <div>{m.parts.filter(isTextPart).map(p => p.text).join("")}</div>
        </div>
      ))}
      <ChatInput
        threadId={threadId}
        setThreadId={(id) => {
          setThreadId(id);
          window.history.pushState({}, "", `/chat/${id}`);
        }}
        sendMessage={sendMessage}
        status={status}
      />
    </div>
  );
}