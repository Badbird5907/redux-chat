import { useEffect } from "react";
import * as Sentry from "@sentry/tanstackstart-react";

export function DefaultRouterError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return <p>{error.stack}</p>;
}
