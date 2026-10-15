import { safeLocalPath } from "@/src/lib/safe-path";
import { signIn } from "@/auth";

function safeNext(value?: string | null): string {
  return safeLocalPath(value, "/home");
}

/**
 * Starts the Noirly OIDC dance on the server and 302s straight to Identity.
 * Kept as a page so Identity One Tap `return_to` and older popup URLs still work
 * without waiting for client hydration + Auth.js `/providers` + `/csrf` fetches.
 */
export default async function LoginPopupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safeNext(next);
  await signIn(
    "noirly",
    { redirectTo: `/login/popup-complete?next=${encodeURIComponent(dest)}` },
    { display: "popup", prompt: "select_account" },
  );
}
