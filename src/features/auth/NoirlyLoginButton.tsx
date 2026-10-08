"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@noirly-dev/ui";
import { LedgerBusyScreen } from "@/src/components/LedgerBusyScreen";
import { ProductGoogleOneTap } from "@/src/features/auth/GoogleOneTap";

const AUTH_MESSAGE = "noirly-auth";
const AUTH_STORAGE_KEY = "noirly-auth";
const BUILD_IDENTITY_URL = process.env.NEXT_PUBLIC_IDENTITY_URL ?? "http://localhost:3000";

function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

function readAuthPayload(): { next?: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { next?: string };
  } catch {
    return null;
  }
}

function popupFeatures() {
  const width = 480;
  const height = 740;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

/**
 * `identityUrl` comes from the server at request time (see identityUrl() in
 * src/server/auth/identity-url.ts). NEXT_PUBLIC_* is inlined at build time, so a
 * build without it pointed One Tap at http://localhost:3000 in production.
 */
export function NoirlyLoginButton({
  redirectTo = "/home",
  identityUrl = BUILD_IDENTITY_URL,
}: {
  redirectTo?: string;
  identityUrl?: string;
}) {
  const IDENTITY_URL = identityUrl;
  const target = safeNext(redirectTo);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const signedInRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function finish(next: string) {
      if (signedInRef.current) return;
      signedInRef.current = true;
      setSignedIn(true);
      setWaiting(true);
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      window.location.assign(safeNext(next));
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; next?: string } | null;
      if (data?.type !== AUTH_MESSAGE) return;
      finish(data.next ?? target);
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== AUTH_STORAGE_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as { next?: string };
        finish(payload.next ?? target);
      } catch {
        finish(target);
      }
    }

    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, [target]);

  function watchPopup(popup: Window) {
    const timer = window.setInterval(() => {
      try {
        if (!popup.closed) return;
        window.clearInterval(timer);
        const payload = readAuthPayload();
        if (payload) {
          if (signedInRef.current) return;
          signedInRef.current = true;
          setSignedIn(true);
          setWaiting(true);
          try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          window.location.assign(safeNext(payload.next ?? target));
          return;
        }
        window.setTimeout(() => {
          if (!signedInRef.current) setWaiting(false);
        }, 600);
      } catch {
        window.clearInterval(timer);
        if (!signedInRef.current) setWaiting(false);
      }
    }, 300);
  }

  function openIdentityPopup() {
    setError(null);
    setSignedIn(false);
    signedInRef.current = false;
    setWaiting(true);
    // Hit the Auth.js route handler, not the HTML popup page — first response
    // is a 302 to Identity instead of a full app hydrate + client signIn.
    const popup = window.open(
      `/api/auth/popup?next=${encodeURIComponent(target)}`,
      "noirly-identity",
      popupFeatures(),
    );
    if (!popup) {
      setWaiting(false);
      setError("Allow popups for Noirly Ledger, then try again.");
      return;
    }
    popup.focus();
    watchPopup(popup);
  }

  function startGoogleOneTap(input: { credential: string; nonce: string }) {
    setError(null);
    setSignedIn(false);
    signedInRef.current = false;
    setWaiting(true);
    const popup = window.open("about:blank", "noirly-identity", popupFeatures());
    if (!popup) {
      setWaiting(false);
      setError("Allow popups for Noirly Ledger, then try again.");
      return;
    }
    const returnTo = `${window.location.origin}/api/auth/popup?next=${encodeURIComponent(target)}`;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `${IDENTITY_URL.replace(/\/$/, "")}/api/auth/google/one-tap`;
    form.target = "noirly-identity";
    form.style.display = "none";
    for (const [name, value] of Object.entries({
      credential: input.credential,
      nonce: input.nonce,
      return_to: returnTo,
    })) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.value = value;
      form.appendChild(field);
    }
    document.body.appendChild(form);
    form.submit();
    form.remove();
    popup.focus();
    watchPopup(popup);
  }

  return (
    <div className="flex flex-col gap-3">
      {mounted && waiting
        ? createPortal(
            <LedgerBusyScreen
              label={signedIn ? "Signing in to Ledger" : "Waiting for Identity"}
            />,
            document.body,
          )
        : null}
      {mounted ? (
        <ProductGoogleOneTap identityUrl={IDENTITY_URL} onCredential={startGoogleOneTap} />
      ) : null}
      {/* The shared button, not a bespoke one. This was styled in accent-ink on
          accent for the old landing page's colour slab; with that gone it was
          the only control in the app that did not match the design system. */}
      <Button
        className="w-full"
        type="button"
        size="lg"
        onClick={openIdentityPopup}
        disabled={waiting}
      >
        {signedIn ? "Signing in…" : waiting ? "Waiting for Identity…" : "Continue with Noirly"}
      </Button>
      {error ? (
        <p className="field-error text-center" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
