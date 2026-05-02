import * as Sentry from "@sentry/tanstackstart-react";

const dsn =
  process.env.VITE_SENTRY_DSN ??
  "https://9e4dc36f99ffee768f08dc2760568178@o4510709921873920.ingest.us.sentry.io/4511317701558272";

Sentry.init({
  dsn,
  sendDefaultPii: true,
});
