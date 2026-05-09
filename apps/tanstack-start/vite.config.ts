import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
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
  build: {
    sourcemap: "hidden",
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
    //
    // NOTE: do NOT externalize `tslib` itself — Vite SSR's `external` only
    // affects the first build stage; the resulting `import "tslib"` then leaks
    // into Nitro's second-stage Rolldown bundle, which can't resolve it from
    // `.nitro/vite/services/ssr/assets/` and fails the build. tslib bundles
    // cleanly on its own; it only breaks when fed through esbuild's interop
    // from a CJS caller, which we've already eliminated by externalizing the
    // CJS callers above.
    external: ["xlsx", "mammoth", "pdf-lib", "unpdf"],
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "src",
    }),
    sentryTanstackStart({
      org: "evan-yu",
      project: "redux-chat",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      tunnelRoute: "/tunnel",
    }),
    viteReact(),
    tailwindcss(),
    nitro({
      noExternals: [
        /node_modules[/\\]@opentelemetry[/\\]/,
        /node_modules[/\\]@sentry[/\\]/,
      ],
    }),
    // Disabled devtools plugin - causes hydration mismatches with SSR
    // The source tracking attributes differ between server and client builds
    // devtools({
    //   ssr: false,
    // }),
  ],
});
