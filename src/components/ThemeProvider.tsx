"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  applyPalette,
  DEFAULT_THEME_ID,
  isValidThemeId,
  NOIRLY_THEMES,
  PALETTE_STORAGE_KEY,
  readStoredPalette,
  type ThemeDefinition,
} from "@noirly-dev/ui";

type ThemeContextValue = {
  paletteId: string;
  setPalette: (id: string) => void;
  themes: ThemeDefinition[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const PALETTE_CHANGED = "noirly:palette-changed";
/** The palette picked in this tab, until another tab changes storage. */
let sessionPalette: string | null = null;

/** Palette changes from this tab, other tabs, or a back/forward restore. */
function subscribePalette(notify: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== PALETTE_STORAGE_KEY) return;
    sessionPalette = null;
    notify();
  }
  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) notify();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener(PALETTE_CHANGED, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener(PALETTE_CHANGED, notify);
  };
}

export function ThemeProvider({
  defaultThemeId = DEFAULT_THEME_ID,
  children,
}: {
  defaultThemeId?: string;
  children: ReactNode;
}) {
  const resolvedDefault = isValidThemeId(defaultThemeId)
    ? defaultThemeId
    : DEFAULT_THEME_ID;
  const getSnapshot = useCallback(() => {
    const stored = sessionPalette ?? readStoredPalette(resolvedDefault);
    return isValidThemeId(stored) ? stored : resolvedDefault;
  }, [resolvedDefault]);
  // Read from storage during render instead of copying it into state from an effect.
  const paletteId = useSyncExternalStore(
    subscribePalette,
    getSnapshot,
    () => resolvedDefault,
  );

  useLayoutEffect(() => {
    applyPalette(paletteId, undefined, resolvedDefault);
  }, [paletteId, resolvedDefault]);

  const setPalette = useCallback((id: string) => {
    if (!isValidThemeId(id)) return;
    sessionPalette = id;
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, id);
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event(PALETTE_CHANGED));
  }, []);

  const value = useMemo(
    () => ({ paletteId, setPalette, themes: NOIRLY_THEMES }),
    [paletteId, setPalette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
