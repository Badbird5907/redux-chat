import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { api } from "@redux/backend/convex/_generated/api";
// import { Chat } from "@/components/chat";
// import { SignedCidProvider } from "@/components/chat/client-id";
import { fetchAuthQuery } from "@/auth/server";
import z from "zod";
import { Link } from "@tanstack/react-router";

const getThreadMessages = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const thread = await fetchAuthQuery(
      api.functions.threads.getThreadMessages,
      { threadId: data.id }
    );
    return thread;
  });

export const Route = createFileRoute("/_app/chat/$id")({
  // params: z.object({ id: z.string() }),
  params: z.object({ id: z.string() }),
  loader: async ({ params }) => {
    const thread = await getThreadMessages({ data: { id: params.id } });
    return { thread, threadId: params.id };
  },
  component: ChatPage,
});

function ChatPage() {
  const { thread, threadId } = Route.useLoaderData();

  return (
    // <SignedCidProvider>
    //   <Chat preload={thread as (typeof api.functions.threads.getThreadMessages)["_returnType"]} initialThreadId={threadId as string} />
    // </SignedCidProvider>
    <div>
      <h1>Hello World (Chat Page)</h1>
      <Link to="/">Home Page</Link>
    </div>
  )
}