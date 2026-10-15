"use client";

import { useCallback, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { DURATION, EASE_OUT, SPRING } from "@noirly-dev/ui/motion";
import { cn } from "@noirly-dev/ui";

const THEME_STORAGE_KEY = "theme";

/** The `dark` class on <html> is the source of truth; watch it rather than copy it. */
function subscribeTheme(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const readDark = () => document.documentElement.classList.contains("dark");

type Props = {
  className?: string;
  /** Compact for AppShell (h-14); default matches marketing / portfolio. */
  size?: "sm" | "md";
};

export function ThemeToggle({ className, size = "md" }: Props) {
  const isDark = useSyncExternalStore(subscribeTheme, readDark, () => true);

  const toggleTheme = useCallback(() => {
    const next = !readDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* private mode — class swap still applies for this session */
    }
  }, []);

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileTap={{ scale: 0.9 }}
      transition={SPRING}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-full border border-[var(--hairline)] text-[var(--text-secondary)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text)]",
        size === "sm" ? "h-9 w-9" : "h-11 w-11",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "sun" : "moon"}
          initial={{ y: 14, opacity: 0, rotate: -45 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 45 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
          className="absolute inline-flex"
        >
          {isDark ? <Sun size={size === "sm" ? 15 : 16} /> : <Moon size={size === "sm" ? 15 : 16} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
