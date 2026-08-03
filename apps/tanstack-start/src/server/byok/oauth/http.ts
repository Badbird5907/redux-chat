import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthQuery, getRequestUserIdFromHeaders } from "@/lib/auth/server";

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

export async function requireByokUser(
  request: Request,
): Promise<{ userId: string } | { response: Response }> {
  const userId = await getRequestUserIdFromHeaders(request.headers);
  if (!userId) {
    return { response: new Response("Unauthorized", { status: 401 }) };
  }
  const billing = await fetchAuthQuery(
    api.functions.billing.getCurrentBillingState,
    {},
  );
  if (!billing.entitlements.byok) {
    return {
      response: Response.json({ error: "byok_plan_required" }, { status: 403 }),
    };
  }
  return { userId };
}

export function logOAuthEvent(args: {
  connector: string;
  connectorVersion?: string;
  stage: string;
  status: "success" | "pending" | "failure";
  modelCount?: number;
}): void {
  console.info("BYOK OAuth event", args);
}

export function oauthResultHtml(args: {
  request: Request;
  connector: string;
  success: boolean;
  message: string;
}): string {
  const origin = new URL(args.request.url).origin;
  const color = args.success ? "#10b981" : "#ef4444";
  const payload = JSON.stringify({
    type: "byok-oauth-complete",
    connector: args.connector,
    success: args.success,
  });
  return `<!DOCTYPE html>
<html><head><title>Provider connection</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center;max-width:420px;padding:2rem">
<div style="font-size:2rem;margin-bottom:1rem">${args.success ? "&#10003;" : "&#10007;"}</div>
<p style="color:${color};font-weight:500">${escapeHtml(args.message)}</p>
<p style="color:#888;font-size:0.875rem;margin-top:1rem">This window will close automatically.</p>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage(${payload}, ${JSON.stringify(origin)});
    setTimeout(() => window.close(), 1500);
  }
</script>
</body></html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
