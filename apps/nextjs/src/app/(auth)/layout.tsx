import type { ReactNode } from "react";

export const metadata = {
  title: {
    template: "%s | Redux Chat",
    default: "Authentication",
  },
};

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

