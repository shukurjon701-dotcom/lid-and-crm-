"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn, formatDate, formatTime } from "@/lib/utils";

/**
 * Кнопка «Обновить»: подтягивает свежие звонки и лиды из Bitrix.
 * Рядом — время последних данных, чтобы было видно, насколько они свежие.
 */
export function RefreshButton({ lastAt }: { lastAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const last = lastAt ? new Date(lastAt) : null;
  const stale = last ? Date.now() - +last > 3 * 60 * 60 * 1000 : true;

  async function refresh() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/refresh?days=3", { method: "POST" });
      const data = await response.json();
      setNote(data.ok ? data.message : (data.error ?? "Не получилось"));
      if (data.ok) router.refresh();
    } catch {
      setNote("Нет связи с сервером");
    } finally {
      setBusy(false);
      setTimeout(() => setNote(null), 6000);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        title={
          last
            ? `Данные на ${formatDate(last)} ${formatTime(last)}`
            : "Данные ещё не загружались"
        }
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold transition",
          stale
            ? "border-warm-line bg-warm-bg text-warm"
            : "border-line bg-surface text-ink-2 hover:text-ink",
          busy && "opacity-60"
        )}
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} strokeWidth={2.4} />
        <span className="hidden sm:inline">
          {busy ? "Обновляю…" : last ? `${formatTime(last)}` : "Обновить"}
        </span>
      </button>

      {note && (
        <p className="card-shadow absolute top-11 right-0 z-30 w-max max-w-[280px] rounded-[var(--radius-control)] bg-surface px-3 py-2 text-[11px] font-medium">
          {note}
        </p>
      )}
    </div>
  );
}
