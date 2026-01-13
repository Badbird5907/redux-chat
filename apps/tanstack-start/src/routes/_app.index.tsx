import { createFileRoute } from "@tanstack/react-router";
// import { Chat } from "@/components/chat";
// import { SignedCidProvider } from "@/components/chat/client-id";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    // <SignedCidProvider>
    //   <Chat initialThreadId={undefined} preload={undefined} />
    // </SignedCidProvider>
    <div>
      <h1>Hello World (Index)</h1>
      <Link to="/test_page">Test Page</Link>
    </div>
  );
}