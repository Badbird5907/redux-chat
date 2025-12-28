import { notFound } from "next/navigation";
import { env } from "@/env";

export default function DevLayout({ children }: { children: React.ReactNode }) {
    if (env.NODE_ENV !== "development") {
        return notFound();
    }
    return children;
}