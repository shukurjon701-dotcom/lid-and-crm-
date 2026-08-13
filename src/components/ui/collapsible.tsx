"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { COLLAPSED_COOKIE, COLLAPSED_MAX_AGE, serializeCollapsed } from "@/lib/collapsed";
import { cn } from "@/lib/utils";

type PanelState = {
  collapsed: string[];
  toggle: (id: string) => void;
};

const PanelContext = createContext<PanelState>({ collapsed: [], toggle: () => {} });

/**
 * Хранит список свёрнутых блоков и пишет его в cookie. Стоит в layout
 * дашбордов, поэтому выбор сохраняется при переходе между экранами
 * и после перезагрузки — у каждого сотрудника свой.
 */
export function CollapsedProvider({
  initial,
  children,
}: {
  initial: string[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initial);

  function toggle(id: string) {
    const next = collapsed.includes(id)
      ? collapsed.filter((item) => item !== id)
      : [...collapsed, id];

    setCollapsed(next);
    document.cookie =
      `${COLLAPSED_COOKIE}=${serializeCollapsed(next)}` +
      `; path=/; max-age=${COLLAPSED_MAX_AGE}; samesite=lax`;
  }

  return (
    <PanelContext.Provider value={{ collapsed, toggle }}>{children}</PanelContext.Provider>
  );
}

function usePanel(id: string) {
  const { collapsed, toggle } = useContext(PanelContext);
  return { open: !collapsed.includes(id), toggle: () => toggle(id) };
}

/** Заголовок-переключатель: шеврон смотрит вниз у раскрытого блока. */
function PanelTitle({
  title,
  open,
  onToggle,
  size = "card",
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  size?: "card" | "section";
}) {
  return (
    <h2 className={cn("font-extrabold tracking-[-0.02em]", size === "card" ? "text-[14px]" : "text-[15px]")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? "Свернуть" : "Развернуть"}
        className="group flex items-center gap-1.5 text-left text-ink transition-colors hover:text-accent"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-ink-3 transition-transform duration-200 group-hover:text-accent",
            !open && "-rotate-90"
          )}
          strokeWidth={2.4}
        />
        {title}
      </button>
    </h2>
  );
}

/**
 * Карточка со сворачиваемым содержимым: клик по заголовку прячет тело,
 * а сам заголовок остаётся — видно, что блок никуда не делся.
 */
export function CollapsibleCard({
  id,
  title,
  hint,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const { open, toggle } = usePanel(id);

  return (
    <Card className={cn(!open && "overflow-hidden", className)}>
      <div
        className={cn(
          "flex items-start justify-between gap-3 px-5 pt-5",
          open ? "pb-4" : "pb-5"
        )}
      >
        <div className="min-w-0">
          <PanelTitle title={title} open={open} onToggle={toggle} />
          {hint && <p className="mt-0.5 pl-[22px] text-xs text-ink-3">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {open && children}
    </Card>
  );
}

/**
 * Группа блоков: ряд плиток, пара карточек, ведущее число. Заголовок нужен
 * не только ради красоты — за него группа и сворачивается.
 */
export function CollapsibleGroup({
  id,
  title,
  hint,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  /** Классы сетки для содержимого группы */
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { open, toggle } = usePanel(id);

  return (
    <section>
      <div className={cn("flex items-end justify-between gap-3", open ? "mb-3" : "mb-0")}>
        <div className="min-w-0">
          <PanelTitle title={title} open={open} onToggle={toggle} size="section" />
          {hint && <p className="pl-[22px] text-xs text-ink-3">{hint}</p>}
        </div>
        {action}
      </div>
      {open && <div className={className}>{children}</div>}
    </section>
  );
}

/**
 * Плашки с итогами в шапке списка. Идентификатор берётся из адреса
 * страницы — так каждый список помнит своё, и передавать его руками
 * в одиннадцать страниц не нужно.
 */
export function CollapsibleStats({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { open, toggle } = usePanel(`stats:${pathname}`);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={open ? "Свернуть показатели" : "Развернуть показатели"}
        className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-3 transition hover:border-line-strong hover:text-ink"
      >
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 transition-transform duration-200", !open && "-rotate-90")}
          strokeWidth={2.4}
        />
      </button>
      {open ? children : <span className="text-xs text-ink-3">Показатели свёрнуты</span>}
    </div>
  );
}
