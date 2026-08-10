import { cn, formatPercent } from "@/lib/utils";

const ACCENTS = {
  s1: "bg-s1",
  s2: "bg-s2",
  s3: "bg-s3",
  s4: "bg-s4",
  accent: "bg-accent",
  critical: "bg-critical",
  good: "bg-good",
} as const;

const ICON_WASH = {
  s1: "bg-accent-soft text-accent",
  s2: "bg-accent-soft text-s2",
  s3: "bg-good-wash text-s3",
  s4: "bg-warning-wash text-warning",
  accent: "bg-accent-soft text-accent",
  critical: "bg-critical-wash text-critical",
  good: "bg-good-wash text-good",
} as const;

/**
 * Плитка метрики: подпись, число, изменение. Иконка сидит в мягкой плашке
 * своего цвета — так ряд плиток читается как набор, а не как таблица.
 */
export function StatTile({
  label,
  hint,
  value,
  sub,
  deltaPct,
  upIsGood = true,
  accent = "accent",
  icon,
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  sub?: React.ReactNode;
  deltaPct?: number | null;
  upIsGood?: boolean;
  accent?: keyof typeof ACCENTS;
  icon?: React.ReactNode;
  className?: string;
}) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const up = hasDelta && deltaPct! >= 0;
  const positive = up === upIsGood;

  return (
    <div
      className={cn(
        "card-shadow group rounded-[var(--radius-card)] bg-surface p-5 transition-shadow duration-200 hover:shadow-[var(--shadow-md)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold text-ink-2">{label}</p>
          {hint && <p className="mt-0.5 text-[11px] text-ink-3">{hint}</p>}
        </div>
        {icon && (
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-[11px]",
              ICON_WASH[accent]
            )}
          >
            {icon}
          </span>
        )}
      </div>

      <p className="mt-4 text-[30px] leading-none font-extrabold tracking-[-0.04em]">
        {value}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
              positive ? "bg-good-wash text-good-text" : "bg-critical-wash text-critical-text"
            )}
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
              <path d={up ? "M5 1.5 L9 7 H1 Z" : "M5 8.5 L1 3 H9 Z"} fill="currentColor" />
            </svg>
            {formatPercent(Math.abs(deltaPct!))}
          </span>
        )}
        {sub && <span className="truncate text-[11.5px] text-ink-3">{sub}</span>}
      </div>
    </div>
  );
}

/**
 * Ведущее число экрана. Одно на дашборд: крупная цифра на цветной подложке,
 * рядом — расшифровка и место под график.
 */
export function HeroFigure({
  label,
  hint,
  value,
  sub,
  tone = "neutral",
  aside,
}: {
  label: string;
  hint?: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "neutral" | "good" | "critical";
  aside?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 -right-20 size-72 rounded-full opacity-[0.09] blur-3xl"
        style={{ background: "var(--accent)" }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-7">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold text-ink-2">{label}</p>
          {hint && <p className="mt-0.5 text-[11.5px] text-ink-3">{hint}</p>}
          <p
            className={cn(
              "mt-4 text-[clamp(38px,6vw,56px)] leading-[1] font-extrabold tracking-[-0.045em]",
              tone === "good" && "text-good-text",
              tone === "critical" && "text-critical-text"
            )}
          >
            {value}
          </p>
          {sub && <div className="mt-3 text-[12.5px] text-ink-2">{sub}</div>}
        </div>
        {aside && <div className="min-w-0 shrink-0">{aside}</div>}
      </div>
    </div>
  );
}
