"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import { LedgerBusyScreen } from "@/src/components/LedgerBusyScreen";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setBusy(true);
    try {
      await signOut({ callbackUrl: "/login", redirect: true });
    } catch {
      window.location.assign("/login");
    }
  }

  return (
    <>
      {busy
        ? createPortal(<LedgerBusyScreen label="Signing out" />, document.body)
        : null}
      <button
        className="shrink-0 cursor-pointer whitespace-nowrap border border-[var(--hairline)] px-3 py-1.5 text-left text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
        type="button"
        onClick={() => void onSignOut()}
        disabled={busy}
      >
        Sign out
      </button>
    </>
  );
}
