import { safeLocalPath } from "@/src/lib/safe-path";
import { headers } from "next/headers";

const AUTH_MESSAGE = "noirly-auth";
const AUTH_STORAGE_KEY = "noirly-auth";

function safeNext(value: string | null): string {
  return safeLocalPath(value, "/home");
}

/** JSON that is safe to drop inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Hands the result back to the opener and closes. Served as a few bytes of
 * HTML rather than a React page so the popup closes as soon as it lands,
 * instead of after the whole app has loaded and hydrated.
 */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  // Set by the proxy alongside the CSP that allows this script.
  const nonce = (await headers()).get("x-nonce") ?? "";
  const html = `<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signing in · Noirly Ledger</title>
<style>html,body{margin:0;height:100%;background:#0b0b0c;color:#a1a1aa;font:11px/1.4 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase;display:flex;align-items:center;justify-content:center}</style>
</head>
<body>
<p role="status">Signed in. Returning to Ledger</p>
<script nonce="${nonce}">
(function () {
  var next = ${scriptJson(next)};
  var payload = { type: ${scriptJson(AUTH_MESSAGE)}, next: next, t: Date.now() };
  try { localStorage.setItem(${scriptJson(AUTH_STORAGE_KEY)}, JSON.stringify(payload)); } catch (e) {}
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(payload, window.location.origin);
    window.close();
    return;
  }
  window.location.replace(next);
})();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
