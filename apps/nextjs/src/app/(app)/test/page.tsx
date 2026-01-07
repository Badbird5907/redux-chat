import { getToken } from "@/auth/server";
import { SignedCidProvider } from "@/components/chat/client-id";
import { Authenticated } from "../authenticated";
import { TestClient } from "./client";

export default async function TestPage() {
  const token = await getToken();
  console.log(token);
  return (
    <div>
      <h1>Test Page</h1>
      <p>{token}</p>
      <SignedCidProvider>
        <Authenticated>
          <TestClient />
        </Authenticated>
      </SignedCidProvider>
    </div>
  );
}
