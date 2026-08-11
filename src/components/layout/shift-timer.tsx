"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, Timer } from "lucide-react";
import { APP } from "@/config/app";
import { cn, formatDuration } from "@/lib/utils";

const KEY = "lid_shift_start";

/**
 * Учёт рабочего времени: «Пришёл / Ушёл» + счётчик смены.
 *
 * Сейчас смена хранится в браузере. После подключения БД начало и конец
 * пишутся в WorkSession и в AuditLog (CHECK_IN / CHECK_OUT) — см. README.
 */
export function ShiftTimer({ labels }: { labels: { checkIn: string; checkOut: string } }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) setStartedAt(Number(saved));
    setReady(true);
  }, []);

  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [startedAt]);

  function checkIn() {
    const ts = Date.now();
    localStorage.setItem(KEY, String(ts));
    setStartedAt(ts);
    setNow(ts);
  }

  function checkOut() {
    localStorage.removeItem(KEY);
    setStartedAt(null);
  }

  if (!ready) return <div className="h-9 w-[132px]" />;

  if (startedAt == null) {
    return (
      <button
        type="button"
        onClick={checkIn}
        className="btn-primary inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold transition"
      >
        <LogIn className="size-4" strokeWidth={2} />
        {labels.checkIn}
      </button>
    );
  }

  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  const pct = Math.min((minutes / (APP.workDayHours * 60)) * 100, 100);

  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5">
      <Timer className="size-4 shrink-0 text-good" strokeWidth={1.75} />
      <div className="min-w-[76px]">
        <p className="tnum text-xs leading-none font-semibold">{formatDuration(minutes)}</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn("h-full rounded-full", pct >= 100 ? "bg-good" : "bg-accent")}
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={checkOut}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-ink-2 transition hover:bg-surface-2 hover:text-ink"
      >
        <LogOut className="size-3.5" strokeWidth={1.75} />
        {labels.checkOut}
      </button>
    </div>
  );
}
