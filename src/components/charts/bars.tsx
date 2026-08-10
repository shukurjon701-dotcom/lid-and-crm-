import { cn } from "@/lib/utils";

export type BarRow = { label: string; value: number; note?: string };

/** Горизонтальные полосы одной серии: ранг несёт длина, а не цвет. */
export function BarList({
  rows,
  format,
  color = "var(--s1)",
  emptyText = "Нет данных",
}: {
  rows: BarRow[];
  format: (value: number) => string;
  color?: string;
  emptyText?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-3">{emptyText}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-2">
              {row.label}
              {row.note && <span className="ml-1.5 text-ink-3">{row.note}</span>}
            </span>
            <span className="tnum shrink-0 text-[12.5px] font-bold">{format(row.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Индикатор заполнения: заливка несёт состояние, дорожка — утопленная. */
export function Meter({
  value,
  max,
  label,
  right,
  tone,
  className,
}: {
  value: number;
  max: number;
  label: React.ReactNode;
  right?: React.ReactNode;
  tone?: "accent" | "good" | "warning" | "critical";
  className?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const resolved = tone ?? (pct >= 100 ? "critical" : pct >= 80 ? "good" : "warning");

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="min-w-0 truncate font-medium text-ink-2">{label}</span>
        {right && <span className="tnum shrink-0 font-bold text-ink-3">{right}</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            resolved === "accent" && "bg-accent",
            resolved === "good" && "bg-good",
            resolved === "warning" && "bg-warning",
            resolved === "critical" && "bg-critical"
          )}
          style={{ width: `${Math.min(Math.max(pct, 3), 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Разбивка суммы на части: сегменты с зазором и обязательной легендой. */
export function StackedBar({
  segments,
  format,
}: {
  segments: { label: string; value: number; color: string }[];
  format: (value: number) => string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);

  return (
    <div>
      <div className="flex h-3 w-full gap-1 overflow-hidden">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className="h-full rounded-full"
            style={{
              width: `${total ? (segment.value / total) * 100 : 0}%`,
              background: segment.color,
              minWidth: segment.value > 0 ? 6 : 0,
            }}
          />
        ))}
        {total === 0 && <div className="h-full w-full rounded-full bg-surface-3" />}
      </div>

      <ul className="mt-4 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
              {segment.label}
            </span>
            <span className="tnum text-[12.5px] font-bold">{format(segment.value)}</span>
            <span className="tnum w-9 text-right text-[11px] text-ink-3">
              {total ? Math.round((segment.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
