"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

/**
 * Экран ошибки для всего приложения.
 *
 * Раньше при недоступной базе подставлялся демо-набор, и сайт выглядел
 * работающим — с выдуманными деньгами, лидами и учениками. Теперь вместо
 * этого показывается вот это: видно, что данных нет, и написано, что делать.
 *
 * Текст ошибки Next в production заменяет на пустой, оставляя только digest —
 * по нему строка находится в логах сервера.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="w-full max-w-[460px] rounded-[var(--radius-card)] border border-line bg-surface p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-[15px] bg-warm-bg text-warm">
          <AlertTriangle className="size-6" strokeWidth={2.2} />
        </span>

        <h1 className="mt-4 text-[19px] font-extrabold tracking-[-0.03em]">
          Данные недоступны
        </h1>
        <p className="mt-2 text-sm text-ink-2">
          База не отвечает или её схема устарела. Пока данных нет, показывать
          нечего — выдуманные цифры вместо настоящих система не подставляет.
        </p>

        {error.message && (
          <p className="mt-4 break-words rounded-[12px] bg-surface-2 px-3 py-2.5 text-left text-[11px] leading-relaxed text-ink-3">
            {error.message}
          </p>
        )}
        {error.digest && (
          <p className="mt-2 text-[11px] text-ink-3">Код ошибки: {error.digest}</p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-5 w-full rounded-[12px] bg-accent px-4 py-2.5 text-sm font-bold text-accent-ink"
        >
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
