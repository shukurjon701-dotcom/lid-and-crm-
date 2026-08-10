"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; count?: number };

/**
 * Поиск и фильтр по статусу. Состояние живёт в адресной строке —
 * ссылку на отфильтрованный список можно переслать коллеге.
 */
export function ListToolbar({
  placeholder = "Поиск…",
  filters,
  filterKey = "filter",
}: {
  placeholder?: string;
  filters?: FilterOption[];
  filterKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(params.get("q") ?? "");

  const active = params.get(filterKey) ?? "";

  // Поиск применяется с задержкой, чтобы не дёргать сервер на каждую букву
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      const query = next.toString();
      if (query !== params.toString()) {
        startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ""}`));
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function setFilter(next: string) {
    const params2 = new URLSearchParams(params.toString());
    if (next) params2.set(filterKey, next);
    else params2.delete(filterKey);
    params2.delete("page");
    const query = params2.toString();
    startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ""}`));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          strokeWidth={1.75}
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-[var(--radius-control)] bg-surface py-2.5 pr-8 pl-9 text-sm font-medium border border-line outline-none transition placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink"
            aria-label="Очистить"
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>

      {filters && filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value === active ? "" : option.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold transition",
                option.value === active
                  ? "btn-primary"
                  : "border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
              )}
            >
              {option.label}
              {option.count !== undefined && (
                <span className={cn("ml-1.5", option.value === active ? "opacity-80" : "text-ink-3")}>
                  {option.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {pending && <span className="text-xs text-ink-3">…</span>}
    </div>
  );
}
