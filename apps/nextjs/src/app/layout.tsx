import type { Metadata, Viewport } from "next";
import { Audiowide, Geist, Geist_Mono } from "next/font/google";

import { Toaster } from "@redux/ui/components/sonner";
import { cn } from "@redux/ui/lib/utils";

import { ThemeProvider } from "@/components/theme-provider";
import { env } from "@/env";

import "@/app/styles.css";

import { ConvexClientProvider } from "@/providers/convex";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://turbo.t3.gg"
      : "http://localhost:3000",
  ),
  title: {
    template: "%s | Redux Chat",
    default: "Redux Chat",
  },
  description:
    "Opinionated full-stack template for quickly bootstrapping a Next.js and turborepo app with tRPC, Drizzle, Shadcn/ui, Better Auth, and more.",
  openGraph: {
    title: "Turbo Kit",
    description:
      "Opinionated full-stack template for quickly bootstrapping a Next.js and turborepo app with tRPC, Drizzle, Shadcn/ui, Better Auth, and more.",
    url: "https://turbo-kit.vercel.app",
    siteName: "Turbo Kit",
  },
  twitter: {
    card: "summary_large_image",
    site: "@jullerino",
    creator: "@jullerino",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const audiowide = Audiowide({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-audiowide",
});

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "bg-background text-foreground min-h-screen font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
          audiowide.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConvexClientProvider>
            {props.children}
            <Toaster />
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
