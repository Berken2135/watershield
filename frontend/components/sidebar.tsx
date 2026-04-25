"use client";

import {
  Bell,
  FileText,
  Fingerprint,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/theme-toggle";
import { useTheme } from "@/lib/theme";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
};

export type SidebarProps = {
  authed?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
};

export default function Sidebar({ authed, onSignIn, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const { theme } = useTheme();

  // Live alert count — counts stations with high/critical risk so the badge
  // always matches what the /alerts page actually shows.
  const [alertCount, setAlertCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("http://127.0.0.1:8000/api/data/europe")
      .then((r) => r.json())
      .then((g) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const n = (g.features ?? []).filter((f: any) =>
          f.properties.risk_level === "high" || f.properties.risk_level === "critical"
        ).length;
        setAlertCount(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const NAV: NavItem[] = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/reports", label: "Reports", icon: FileText },
    { href: "/alerts", label: "Alerts", icon: Bell, badge: alertCount ?? undefined },
  ];

  const logoSrc = theme === "light" ? "/logo-black.png" : "/logo.png";

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-border bg-background/50 backdrop-blur-md">
      <div className="flex items-center justify-start pl-3 pr-4 h-24 border-b border-border">
        <Image
          src={logoSrc}
          alt="WaterShield"
          width={220}
          height={110}
          priority
          className="h-14 w-auto object-contain"
        />
      </div>

      <nav className="flex-1 px-3 py-5 flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} />
        ))}
      </nav>

      <div className="border-t border-border p-3 space-y-1.5">
        <ThemeToggle />
        {authed ? (
          <button
            type="button"
            onClick={onSignOut}
            className="group flex items-center gap-3 w-full rounded-md px-3 py-2 text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors"
          >
            <span className="grid place-items-center h-6 w-6 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="flex-1 text-left text-foreground/80">Verified</span>
            <LogOut className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="flex items-center justify-center gap-2 w-full rounded-md bg-primary/10 ring-1 ring-primary/30 px-3 py-2 text-[12px] font-medium text-primary hover:bg-primary/15 transition-colors"
          >
            <Fingerprint className="h-3.5 w-3.5" />
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${
        active
          ? "bg-foreground/[0.05] text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-primary" />
      )}
      <Icon
        strokeWidth={1.5}
        className={`h-4 w-4 ${active ? "text-primary" : ""}`}
      />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500/15 ring-1 ring-red-500/30 text-[10px] font-medium text-red-600 dark:text-red-300">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
