"use client";

import { useState } from "react";
import { cn, formatNumber } from "@/lib/utils";

export type DonutSlice = { label: string; value: number };

/** Фиксированный порядок слотов — цвет закреплён за сущностью, а не за рангом. */
const SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
const OTHER = "var(--ink-3)";

const SIZE = 168;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 2; // 2px разрыв в цвет поверхности между сегментами

/**
 * Кольцевая диаграмма долей. Больше 5 категорий не раскрашиваем — остальное
 * сворачивается в «Другое»: девятый цвет не изобретаем.
 * Легенда с числами обязательна — она же табличное представление данных.
 */
export function Donut({
  slices,
  unit = "",
  centerLabel,
}: {
  slices: DonutSlice[];
  unit?: string;
  centerLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 5);
  const tail = sorted.slice(5);
  const data =
    tail.length > 0
      ? [...head, { label: "Другое", value: tail.reduce((a, s) => a + s.value, 0) }]
      : head;

  const total = data.reduce((acc, s) => acc + s.value, 0) || 1;
  const colorOf = (i: number) => (i < 5 ? SLOTS[i] : OTHER);

  let offset = 0;
  const arcs = data.map((slice, i) => {
    const length = (slice.value / total) * C;
    const arc = {
      slice,
      color: colorOf(i),
      dash: Math.max(length - GAP, 0.5),
      offset,
      index: i,
    };
    offset += length;
    return arc;
  });

  const shown = active != null ? data[active] : null;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} role="img" aria-label={centerLabel}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.slice.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={arc.color}
                strokeWidth={active === arc.index ? STROKE + 4 : STROKE}
                strokeDasharray={`${arc.dash} ${C - arc.dash}`}
                strokeDashoffset={-arc.offset}
                className="transition-all duration-150"
                onMouseEnter={() => setActive(arc.index)}
                onMouseLeave={() => setActive(null)}
              />
            ))}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="text-[22px] leading-none font-semibold tracking-[-0.02em]">
            {formatNumber(shown ? shown.value : total)}
          </p>
          <p className="mt-1 max-w-[104px] text-[11px] text-ink-3">
            {shown ? shown.label : centerLabel}
          </p>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((slice, i) => (
          <li
            key={slice.label}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1 transition-colors",
              active === i && "bg-surface-2"
            )}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: colorOf(i) }}
            />
            <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{slice.label}</span>
            <span className="tnum text-xs font-medium">
              {formatNumber(slice.value)}
              {unit && <span className="ml-1 text-ink-3">{unit}</span>}
            </span>
            <span className="tnum w-11 text-right text-[11px] text-ink-3">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
