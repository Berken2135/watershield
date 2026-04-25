"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "watershield-theme";

type Listener = (t: Theme) => void;
const listeners = new Set<Listener>();
let current: Theme = "light";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

function setGlobal(t: Theme) {
  current = t;
  applyTheme(t);
  try {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(t));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      const initial: Theme = stored ?? current;
      if (initial !== current) {
        current = initial;
        applyTheme(initial);
      }
    }
    setThemeState(current);

    const listener: Listener = (t) => setThemeState(t);
    listeners.add(listener);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        if (e.newValue !== current) setGlobal(e.newValue as Theme);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((t: Theme) => setGlobal(t), []);
  const toggle = useCallback(() => setGlobal(current === "dark" ? "light" : "dark"), []);

  return { theme, setTheme, toggle };
}
