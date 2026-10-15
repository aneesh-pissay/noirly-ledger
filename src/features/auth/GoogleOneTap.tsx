"use client";

import { useEffect, useRef, useState } from "react";

type CredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    nonce?: string;
    context?: string;
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: () => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<GoogleAccountsId> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts.id) {
      resolve(window.google.accounts.id);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.accounts.id) resolve(window.google.accounts.id);
        else reject(new Error("Google Identity Services failed to load"));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else reject(new Error("Google Identity Services failed to load"));
    };
    script.onerror = () => reject(new Error("Google Identity Services failed to load"));
    document.head.appendChild(script);
  });
}

export function ProductGoogleOneTap({
  identityUrl,
  onCredential,
}: {
  identityUrl: string;
  onCredential: (input: { credential: string; nonce: string }) => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const callbackRef = useRef(onCredential);
  // Keep the latest callback for GSI without writing a ref during render.
  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${identityUrl.replace(/\/$/, "")}/api/auth/oauth-providers`)
      .then((res) => res.json() as Promise<{ google?: boolean; googleClientId?: string | null }>)
      .then(async (data) => {
        if (cancelled || !data.google || !data.googleClientId) return;
        const accounts = await loadGsi();
        if (cancelled) return;
        const nonce =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(Date.now());
        accounts.initialize({
          client_id: data.googleClientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
          context: "signin",
          nonce,
          callback: (response) => {
            if (!response.credential) return;
            callbackRef.current({ credential: response.credential, nonce });
          },
        });
        accounts.disableAutoSelect();
        accounts.prompt();
        if (buttonRef.current) {
          buttonRef.current.innerHTML = "";
          accounts.renderButton(buttonRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: buttonRef.current.offsetWidth || 336,
          });
          setRendered(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identityUrl]);

  // The slot has to exist in the DOM before Google can render into it, but it
  // must not reserve height until it does — an empty 40px box plus its caption
  // left a ~110px hole above the sign-in button whenever Identity has no Google
  // provider configured, or the provider lookup fails.
  return (
    <div className={rendered ? "flex flex-col gap-2" : "contents"}>
      <div
        ref={buttonRef}
        className={rendered ? "flex min-h-10 w-full justify-center" : "hidden"}
      />
      {rendered ? <p className="meta text-center">Google One Tap · pick any account</p> : null}
    </div>
  );
}
