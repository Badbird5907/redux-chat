import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3712,
  },
  ssr: {
    noExternal: ["@convex-dev/better-auth", "streamdown"],
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "src",
    }),
    viteReact(),
    tailwindcss(),
    nitro(),
    // Disabled devtools plugin - causes hydration mismatches with SSR
    // The source tracking attributes differ between server and client builds
    // devtools({
    //   ssr: false,
    // }),
  ],
});
