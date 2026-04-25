"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={
        compact
          ? "grid place-items-center h-8 w-8 rounded-md hover:bg-foreground/[0.04] text-muted-foreground hover:text-foreground transition-colors"
          : "flex items-center gap-2 w-full rounded-md px-3 py-2 text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors"
      }
    >
      {isDark ? <Sun className="h-3.5 w-3.5" strokeWidth={1.6} /> : <Moon className="h-3.5 w-3.5" strokeWidth={1.6} />}
      {!compact && <span>{isDark ? "Light" : "Dark"} mode</span>}
    </button>
  );
}
