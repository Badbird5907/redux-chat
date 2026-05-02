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
    // These CJS libs ship ES5 + tslib helpers (`__extends` etc). When Vite/esbuild
    // wraps `require("tslib")` with its CJS→ESM interop (`__toESM(...).default`),
    // the result is `undefined` and the destructure `const { __extends } = tslib`
    // crashes at SSR time (seen on prod Lambda as
    // `Cannot destructure property '__extends' of '__toESM$1(...).default'`).
    // Marking them external keeps them as Node `require()` at runtime, where
    // tslib resolves correctly. They're server-only document parsers and have
    // no business in the SSR bundle. Nitro's tracer (default `noExternals: false`)
    // ships them into the Lambda's node_modules, so the deployment stays
    // self-contained.
    external: ["xlsx", "mammoth", "pdf-lib", "unpdf", "tslib"],
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
