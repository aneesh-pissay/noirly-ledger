"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Check, LayoutGrid } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@noirly-dev/ui";
import { DURATION, EASE_OUT, SPRING } from "@noirly-dev/ui/motion";

export type NoirlyAppId = "flow" | "ledger" | "split" | "pulse";

const isDev = process.env.NODE_ENV !== "production";

/**
 * The Noirly apps one account opens. Each address can be overridden at build
 * time; otherwise local dev ports, or the production hosts.
 * (process.env.NEXT_PUBLIC_* must be written out in full to be inlined.)
 */
const NOIRLY_APPS: Array<{ id: NoirlyAppId; name: string; blurb: string; url: string }> = [
  {
    id: "flow",
    name: "Flow",
    blurb: "Tasks and projects",
    url: process.env.NEXT_PUBLIC_NOIRLY_FLOW_URL ?? (isDev ? "http://localhost:3002" : "https://noirly.flow.aneesh-pissay.in"),
  },
  {
    id: "ledger",
    name: "Ledger",
    blurb: "Budgets and spending",
    url: process.env.NEXT_PUBLIC_NOIRLY_LEDGER_URL ?? (isDev ? "http://localhost:3003" : "https://noirly.ledger.aneesh-pissay.in"),
  },
  {
    id: "split",
    name: "Split",
    blurb: "Shared expenses",
    url: process.env.NEXT_PUBLIC_NOIRLY_SPLIT_URL ?? (isDev ? "http://localhost:3005" : "https://noirly.split.aneesh-pissay.in"),
  },
  {
    id: "pulse",
    name: "Pulse",
    blurb: "Messages and calls",
    url: process.env.NEXT_PUBLIC_NOIRLY_PULSE_URL ?? (isDev ? "http://localhost:3004" : "https://noirly.pulse.aneesh-pissay.in"),
  },
];

type Props = {
  /** The app this switcher is shown in. */
  current: NoirlyAppId;
  className?: string;
};

/**
 * Header menu for moving between Noirly apps. They share one Noirly account,
 * so the other app opens already signed in (or after one click).
 */
export function AppSwitcher({ current, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        whileTap={{ scale: 0.9 }}
        transition={SPRING}
        aria-label="Noirly apps"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] text-[var(--text-secondary)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text)]"
      >
        <LayoutGrid size={15} aria-hidden />
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.nav
            id={menuId}
            aria-label="Noirly apps"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-2 shadow-[var(--elev-2)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-72"
          >
            <p className="mono-label px-2 py-1.5">Noirly apps</p>
            <ul>
              {NOIRLY_APPS.map((app) => {
                const here = app.id === current;
                return (
                  <li key={app.id}>
                    <a
                      href={here ? "/" : app.url}
                      aria-current={here ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-[var(--r-md)] px-2.5 py-2 text-sm transition-colors",
                        here
                          ? "bg-[var(--accent-soft)] text-[var(--text)]"
                          : "text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:text-[var(--text)]",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{app.name}</span>
                        <span className="block text-xs text-[var(--text-muted)]">{app.blurb}</span>
                      </span>
                      {here ? (
                        <Check size={14} className="shrink-0 text-[var(--accent)]" aria-hidden />
                      ) : (
                        <ArrowUpRight size={14} className="shrink-0 opacity-60" aria-hidden />
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
