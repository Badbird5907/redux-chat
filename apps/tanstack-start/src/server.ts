// Serverless-friendly init (Vercel / Netlify): no Node `--import`; see
// https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/#without---import-flag
import "../instrument.server.mjs";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

const requestHandler = wrapFetchWithSentry({
  fetch(request: Request) {
    return handler.fetch(request);
  },
});

export default createServerEntry(requestHandler);
