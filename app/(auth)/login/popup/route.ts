import { safeLocalPath } from "@/src/lib/safe-path";
import { signIn } from "@/auth";

function safeNext(value: string | null): string {
  return safeLocalPath(value, "/home");
}

/**
 * Starts the Identity sign-in on the server and redirects the popup straight
 * to it. A client page here had to download and hydrate the whole app, then
 * fetch a CSRF token and POST to Auth.js, before the popup went anywhere.
 */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const redirectTo = `/login/popup-complete?next=${encodeURIComponent(next)}`;
  const url = await signIn(
    "noirly",
    { redirectTo, redirect: false },
    { display: "popup", prompt: "select_account" },
  );
  return Response.redirect(url, 302);
}
