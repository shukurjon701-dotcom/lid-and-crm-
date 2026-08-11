"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LogOut, Menu, X } from "lucide-react";
import { NavIcon } from "@/components/layout/icon";
import { ShiftTimer } from "@/components/layout/shift-timer";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { RefreshButton } from "@/components/layout/refresh-button";
import { APP } from "@/config/app";
import { cn, initials } from "@/lib/utils";
import { logout } from "@/server/actions/auth";
import type { NavSection } from "@/config/nav";

export type AppShellProps = {
  user: { fullName: string; roleLabel: string; login: string };
  nav: NavSection[];
  isDemo: boolean;
  lastCallAt: string | null;
  canRefresh: boolean;
  children: React.ReactNode;
};

export function AppShell({ user, nav, isDemo, lastCallAt, canRefresh, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const current = nav.flatMap((s) => s.items).find((i) => pathname.startsWith(i.href));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* ------------------------------- Боковая панель ------------------------------- */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-nav transition-transform duration-200 lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-[68px] items-center justify-between px-5">
          <Link href="/shtab" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-[11px] bg-accent text-[13px] font-extrabold text-accent-ink">
              {APP.shortName}
            </span>
            <span className="text-[15px] font-extrabold tracking-[-0.03em] text-nav-ink-strong">
              {APP.name}
            </span>
          </Link>
          <button
            type="button"
            className="text-ink-3 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Закрыть меню"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="scroll-slim flex-1 overflow-y-auto px-3 pb-4">
          {nav.map((section) => (
            <div key={section.title} className="mb-6">
              <p className="px-3 pb-2 text-[10px] font-bold tracking-[0.1em] text-ink-3 uppercase">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "group flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-[13.5px] transition-colors",
                          active
                            ? "bg-nav-active font-bold text-nav-active-ink"
                            : "font-medium text-nav-ink hover:bg-surface-2 hover:text-ink"
                        )}
                      >
                        <NavIcon
                          name={item.icon}
                          className={cn("size-[18px] shrink-0", active && "text-nav-active-ink")}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span
                            className={cn(
                              "text-[10px] font-medium",
                              active ? "text-nav-active-ink/60" : "text-ink-3"
                            )}
                          >
                            {item.hint}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-3">
          <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-surface-3 p-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">
              {initials(user.fullName) || "·"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-ink">
                {user.fullName}
              </span>
              <span className="block truncate text-[11px] text-ink-3">{user.roleLabel}</span>
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg p-1.5 text-ink-3 transition hover:bg-surface hover:text-ink"
                aria-label="Выйти"
                title="Выйти"
              >
                <LogOut className="size-4" strokeWidth={2} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* --------------------------------- Контент --------------------------------- */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-xl lg:px-7">
          <button
            type="button"
            className="text-ink-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu className="size-5" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-extrabold tracking-[-0.03em]">
              {current?.label ?? "Дашборд"}
            </h1>
            {current?.hint && <p className="truncate text-[11px] text-ink-3">{current.hint}</p>}
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {isDemo && (
              <span className="hidden rounded-full bg-warning-wash px-3 py-1.5 text-[11px] font-bold text-warning sm:inline">
                Демо-данные
              </span>
            )}
            <span className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold sm:inline-flex">
              <Building2 className="size-3.5 text-ink-3" strokeWidth={2.2} />
              {APP.branch.name}
            </span>
            {canRefresh && <RefreshButton lastAt={lastCallAt} />}
            <ShiftTimer />
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
