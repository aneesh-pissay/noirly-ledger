import { safeLocalPath } from "@/src/lib/safe-path";
import { NextResponse } from "next/server";
import { signIn } from "@/auth";

function safeNext(value: string | null): string {
  return safeLocalPath(value, "/home");
}

/**
 * Thin entry for the sign-in popup. Avoids rendering the app shell so the
 * browser can follow Auth.js straight to Identity on the first response.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));

  const url = await signIn(
    "noirly",
    {
      redirect: false,
      redirectTo: `/login/popup-complete?next=${encodeURIComponent(next)}`,
    },
    { display: "popup", prompt: "select_account" },
  );

  return NextResponse.redirect(new URL(String(url), request.url));
}
