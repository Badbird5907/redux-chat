import SignInPage from "./client";
import { getToken } from "@/auth/server";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Sign In",
};

export default async function Page() {
  const token = await getToken();
  if (token) {
    redirect("/");
  }
  return <SignInPage />;
}
