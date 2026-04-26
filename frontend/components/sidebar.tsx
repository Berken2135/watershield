"use client";

import ThemeToggle from "@/components/theme-toggle";
import { useTheme } from "@/lib/theme";
import {
  Bell,
  FileText,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

function useAlertCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/data/europe`)
      .then((r) => r.json())
      .then((g) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const n = (g.features ?? []).filter((f: any) =>
          f.properties.risk_level === "high" || f.properties.risk_level === "critical"
        ).length;
        setCount(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return count;
}

function useLogoSrc() {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Until mounted, render the dark logo to match the SSR HTML.
  if (!mounted) return "/logo.png";
  return theme === "light" ? "/logo-black.png" : "/logo.png";
}

function buildNav(alertCount: number | null): NavItem[] {
  return [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/reports", label: "Reports", icon: FileText },
    { href: "/alerts", label: "Alerts", icon: Bell, badge: alertCount ?? undefined },
  ];
}

export default function Sidebar({ authed, onSignIn, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const alertCount = useAlertCount();
  const logoSrc = useLogoSrc();
  const NAV = buildNav(alertCount);

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-border bg-background/50 backdrop-blur-md">
      <Link
        href="/"
        className="flex items-center justify-center px-4 h-24 border-b border-border hover:bg-foreground/[0.02] transition-colors"
        aria-label="WaterShield home"
      >
        <Image
          src={logoSrc}
          alt="WaterShield"
          width={220}
          height={110}
          priority
          className="h-14 w-auto object-contain"
        />
      </Link>

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

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
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

/* ─────────────────────────── Mobile drawer ─────────────────────────── */

export function MobileTopBar({ authed, onSignIn, onSignOut }: SidebarProps) {
  const pathname = usePathname();
  const alertCount = useAlertCount();
  const logoSrc = useLogoSrc();
  const NAV = buildNav(alertCount);
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <header className="md:hidden flex items-center justify-between gap-2 h-14 px-3 border-b border-border bg-background/80 backdrop-blur-md z-30 relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid place-items-center h-9 w-9 rounded-md hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Link href="/" className="flex items-center" aria-label="WaterShield home">
          <Image
            src={logoSrc}
            alt="WaterShield"
            width={160}
            height={64}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>
        <Link
          href="/alerts"
          className="relative grid place-items-center h-9 w-9 rounded-md hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground"
          aria-label="Alerts"
        >
          <Bell className="h-4 w-4" />
          {alertCount && alertCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 grid place-items-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-500/90 text-[9px] font-medium text-white">
              {alertCount}
            </span>
          ) : null}
        </Link>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-[80]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-background border-r border-border flex flex-col">
            <div className="flex items-center justify-between px-3 h-14 border-b border-border">
              <Link href="/" onClick={() => setOpen(false)} aria-label="WaterShield home">
                <Image
                  src={logoSrc}
                  alt="WaterShield"
                  width={180}
                  height={72}
                  className="h-9 w-auto object-contain"
                />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid place-items-center h-9 w-9 rounded-md hover:bg-foreground/[0.05] text-muted-foreground"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname === item.href}
                  onClick={() => setOpen(false)}
                />
              ))}
            </nav>
            <div className="border-t border-border p-3 space-y-1.5">
              <ThemeToggle />
              {authed ? (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onSignOut?.(); }}
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
                  onClick={() => { setOpen(false); onSignIn?.(); }}
                  className="flex items-center justify-center gap-2 w-full rounded-md bg-primary/10 ring-1 ring-primary/30 px-3 py-2 text-[12px] font-medium text-primary hover:bg-primary/15 transition-colors"
                >
                  <Fingerprint className="h-3.5 w-3.5" />
                  Sign in
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
