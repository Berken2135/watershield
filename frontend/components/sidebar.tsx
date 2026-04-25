"use client";

import {
  AlertTriangle,
  Bell,
  FileText,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Settings,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/alerts", label: "Alerts", icon: Bell, badge: 3 },
];

const SECONDARY: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export type SidebarProps = {
  authed?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
};

export default function Sidebar({ authed, onSignIn, onSignOut }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-[212px] shrink-0 flex-col border-r border-border bg-background/40 backdrop-blur-md">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border">
        <div className="relative grid place-items-center h-7 w-7 rounded-md bg-cyan-400/10 ring-1 ring-cyan-400/30">
          <Waves className="h-3.5 w-3.5 text-[var(--color-cyan)]" />
          <span className="absolute inset-0 rounded-md ring-1 ring-cyan-400/20 pulse-ring" />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">WaterShield</div>
          <div className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
            Predictive AI
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 flex flex-col gap-0.5">
        <SectionLabel>Workspace</SectionLabel>
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname === item.href}
          />
        ))}

        <div className="my-4 border-t border-border" />

        <SectionLabel>Account</SectionLabel>
        {SECONDARY.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={pathname === item.href}
          />
        ))}
      </nav>

      {/* Footer auth */}
      <div className="border-t border-border p-3">
        {authed ? (
          <button
            type="button"
            onClick={onSignOut}
            className="group flex items-center gap-3 w-full rounded-md px-3 py-2 text-[13px] text-muted-foreground hover:bg-white/[0.03] hover:text-foreground transition-colors"
          >
            <span className="grid place-items-center h-7 w-7 rounded-md bg-emerald-400/10 ring-1 ring-emerald-400/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
            </span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-foreground/90 truncate">Verified</div>
              <div className="text-[10px] text-muted-foreground">EU Operator</div>
            </div>
            <LogOut className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="flex items-center justify-center gap-2 w-full rounded-md bg-cyan-400/10 ring-1 ring-cyan-400/30 px-3 py-2 text-[12px] font-medium text-cyan-200 hover:bg-cyan-400/15 transition-colors"
          >
            <Fingerprint className="h-3.5 w-3.5" />
            Biometric Sign In
          </button>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-1 text-[9px] tracking-[0.22em] uppercase text-muted-foreground/70">
      {children}
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] transition-colors ${
        active
          ? "bg-white/[0.04] text-foreground"
          : "text-muted-foreground hover:bg-white/[0.025] hover:text-foreground"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-px bg-[var(--color-cyan)] shadow-[0_0_6px_#22d3ee]" />
      )}
      <Icon
        strokeWidth={1.5}
        className={`h-4 w-4 transition-colors ${active ? "text-[var(--color-cyan)]" : ""}`}
      />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500/15 ring-1 ring-red-500/30 text-[10px] font-medium text-red-300">
          {item.badge}
        </span>
      ) : null}
      {item.label === "Alerts" && !item.badge ? null : null}
      {/* subtle alert pulse */}
      {item.icon === AlertTriangle ? (
        <span className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_6px_#ef4444]" />
      ) : null}
    </Link>
  );
}
