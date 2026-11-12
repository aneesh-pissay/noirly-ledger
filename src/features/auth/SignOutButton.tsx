"use client";

import { createPortal, useFormStatus } from "react-dom";
import { signOutAction } from "@/src/features/auth/actions";
import { LedgerBusyScreen } from "@/src/components/LedgerBusyScreen";

/**
 * A server action, so sign-out is one request: the action clears the session
 * and its redirect carries /login back in the same response. The client
 * signOut() it replaced fetched a CSRF token, POSTed, then loaded /login.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction} className="shrink-0">
      <SignOutSubmit />
    </form>
  );
}

function SignOutSubmit() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending
        ? createPortal(<LedgerBusyScreen label="Signing out" />, document.body)
        : null}
      <button
        className="shrink-0 cursor-pointer whitespace-nowrap border border-[var(--hairline)] px-3 py-1.5 text-left text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
        type="submit"
        disabled={pending}
      >
        Sign out
      </button>
    </>
  );
}
