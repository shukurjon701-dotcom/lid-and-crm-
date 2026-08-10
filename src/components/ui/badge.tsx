import { cn } from "@/lib/utils";
import type { LeadSource } from "@/types/domain";

/**
 * Плашки состояния. У каждой свой фон, своя рамка и точка — так строка
 * таблицы читается по цвету с одного взгляда, а не только по тексту.
 */
const TONES = {
  neutral: "bg-surface-3 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-transparent",

  /* температура клиента */
  hot: "bg-hot-bg text-hot border-hot-line",
  warm: "bg-warm-bg text-warm border-warm-line",
  cold: "bg-cold-bg text-cold border-cold-line",
  dead: "bg-dead-bg text-dead border-dead-line",
  fresh: "bg-fresh-bg text-fresh border-fresh-line",

  /* прежние имена — чтобы не переписывать все страницы */
  good: "bg-fresh-bg text-fresh border-fresh-line",
  warning: "bg-warm-bg text-warm border-warm-line",
  critical: "bg-hot-bg text-hot border-hot-line",
} as const;

const DOTS = {
  neutral: "bg-ink-3",
  accent: "bg-accent",
  hot: "bg-hot",
  warm: "bg-warm",
  cold: "bg-cold",
  dead: "bg-dead",
  fresh: "bg-fresh",
  good: "bg-fresh",
  warning: "bg-warm",
  critical: "bg-hot",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

/** Цвета площадок: Instagram, Telegram и остальные узнаются мгновенно. */
const SOURCE_COLOR: Record<LeadSource, string> = {
  INSTAGRAM: "var(--src-instagram)",
  TELEGRAM: "var(--src-telegram)",
  FACEBOOK: "var(--src-facebook)",
  TIKTOK: "var(--ink)",
  WEBSITE: "var(--src-web)",
  INBOUND_CALL: "var(--src-call)",
  REFERRAL: "var(--src-call)",
  WALK_IN: "var(--warm)",
  OTHER: "var(--src-other)",
};

export function SourceMark({
  source,
  label,
}: {
  source: LeadSource;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: SOURCE_COLOR[source] }}
      />
      {label}
    </span>
  );
}
