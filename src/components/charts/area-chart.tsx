"use client";

import { useRef, useState } from "react";
import { formatDayMonth, formatMoney, formatNumber } from "@/lib/utils";

export type AreaPoint = { date: Date; value: number };

const W = 640;
const H = 180;
const PAD = { top: 14, right: 8, bottom: 22, left: 8 };

/**
 * Одна серия: линия 2px + заливка-вымывка 10%, hairline-сетка,
 * прямая подпись только на последней точке, кроссхэйр с тултипом при наведении.
 * Легенда не нужна — серия одна, её называет заголовок карточки.
 */
export function AreaChart({
  points,
  format = "money",
  color = "var(--s1)",
  label,
}: {
  points: AreaPoint[];
  /** Строка, а не функция: серверный компонент не может передать функцию клиентскому */
  format?: "money" | "count";
  color?: string;
  label: string;
}) {
  const render = (value: number) =>
    format === "money" ? formatMoney(value) : formatNumber(value);

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;

  const last = points[points.length - 1];
  const active = hover != null ? points[hover] : null;

  function onMove(event: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const svgX = ratio * W;
    const index = Math.round(((svgX - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.min(Math.max(index, 0), points.length - 1));
  }

  const gridValues = [0, 0.5, 1].map((f) => f * max);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-[180px] w-full"
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id="area-wash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridValues.map((v) => (
          <line
            key={v}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill="url(#area-wash)" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && hover != null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--line-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(hover)}
              cy={y(active.value)}
              r="5"
              fill={color}
              stroke="var(--surface)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {/* конечная точка с кольцом в цвет поверхности */}
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r="4.5"
          fill={color}
          stroke="var(--surface)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Подписи оси X — только края и середина, чтобы не шуметь */}
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>{formatDayMonth(points[0].date)}</span>
        <span>{formatDayMonth(points[Math.floor(points.length / 2)].date)}</span>
        <span>сегодня</span>
      </div>

      {active && hover != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-[var(--shadow-md)]"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: 0,
          }}
        >
          <p className="text-[10px] text-ink-3">{formatDayMonth(active.date)}</p>
          <p className="tnum text-xs font-semibold">{render(active.value)}</p>
        </div>
      )}
    </div>
  );
}
