import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Column<T> = {
  header: string;
  hint?: string;
  align?: "left" | "right";
  width?: string;
  render: (row: T, index: number) => React.ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Ничего не найдено",
  minWidth = 720,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  empty?: string;
  minWidth?: number;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead>
            <tr className="text-left text-[11px] text-ink-3">
              {columns.map((column, i) => (
                <th
                  key={column.header + i}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    "bg-surface-3/60 px-3 py-3 font-bold tracking-[0.02em] whitespace-nowrap uppercase",
                    i === 0 && "rounded-l-[10px] pl-5",
                    i === columns.length - 1 && "rounded-r-[10px] pr-5",
                    column.align === "right" && "text-right"
                  )}
                >
                  {column.header}
                  {column.hint && <span className="ml-1.5 normal-case opacity-70">{column.hint}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className="border-t border-line transition-colors hover:bg-surface-2"
              >
                {columns.map((column, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-3 py-3 align-middle",
                      i === 0 && "pl-5",
                      i === columns.length - 1 && "pr-5",
                      column.align === "right" && "tnum text-right"
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-5 py-16 text-center text-sm text-ink-3">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Pagination({
  page,
  pages,
  from,
  to,
  total,
  params,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  if (total === 0) return null;

  const href = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `?${query}` : "?";
  };

  const button =
    "rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-2 transition hover:border-line-strong hover:text-ink";

  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-ink-3">
      <span className="tnum">
        {from}–{to} из {total}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          {page > 1 && (
            <Link href={href(page - 1)} className={button}>
              ← Назад
            </Link>
          )}
          <span className="tnum px-1 font-bold">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link href={href(page + 1)} className={button}>
              Вперёд →
            </Link>
          )}
        </span>
      )}
    </div>
  );
}

export function ListHeader({
  title,
  hint,
  stats,
}: {
  title: string;
  hint?: string;
  stats?: { label: string; value: string; tone?: "good" | "critical" | "neutral" }[];
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-5">
      <div>
        <h2 className="text-[22px] font-extrabold tracking-[-0.035em]">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
      </div>
      {stats && stats.length > 0 && (
        <dl className="flex flex-wrap gap-2.5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="card-shadow rounded-[var(--radius-control)] bg-surface px-3.5 py-2"
            >
              <dt className="text-[10.5px] font-bold text-ink-3">{stat.label}</dt>
              <dd
                className={cn(
                  "tnum text-[15px] font-extrabold",
                  stat.tone === "good" && "text-good-text",
                  stat.tone === "critical" && "text-critical-text"
                )}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
