import { getToken } from "@/auth/server";
import { TestClient } from "./client";

export default async function TestPage() {
  const token = await getToken();
  console.log(token);
  return (
    <div>
      <h1>Test Page</h1>
      <p>{token}</p>
      <TestClient />
    </div>
  );
}