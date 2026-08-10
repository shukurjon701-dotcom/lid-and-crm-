import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { APP } from "@/config/app";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOCALE = APP.locale;

/** 12500000 → «12 500 000 сум», compact → «12,5 млн сум» */
export function formatMoney(value: number, compact = false): string {
  if (!Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat(LOCALE, {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
  return `${formatted} ${APP.currency}`;
}

/** Без единицы — для осей и плотных таблиц */
export function formatShort(value: number): string {
  return new Intl.NumberFormat(LOCALE, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function formatDate(date: Date | string, withTime = false): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" }).format(date);
}

/** «5 дней» / «1 день» — для срока долга */
export function formatDays(days: number): string {
  const n = Math.abs(days) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return `${days} дней`;
  if (n1 === 1) return `${days} день`;
  if (n1 > 1 && n1 < 5) return `${days} дня`;
  return `${days} дней`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} мин`;
  return `${h} ч ${String(m).padStart(2, "0")} мин`;
}

export function initials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
