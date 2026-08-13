/**
 * Скелет раздела.
 *
 * Без него Next держит старый экран, пока сервер не отдаст новый: клик по
 * пункту меню выглядит так, будто ничего не произошло — особенно заметно,
 * когда сервер небыстрый. Со скелетом каркас появляется сразу, а заодно
 * включается предзагрузка: Next заранее тянет эту оболочку, как только
 * курсор наводится на пункт меню.
 *
 * Форма повторяет дашборд — ведущее число, ряд плиток, две карточки.
 * Точное совпадение не нужно, важно, чтобы экран не прыгал при подмене.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <span className="sr-only">Загрузка раздела…</span>

      <div className="h-[148px] rounded-[var(--radius-card)] border border-line bg-surface" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card-shadow rounded-[var(--radius-card)] bg-surface p-5">
            <div className="h-3 w-24 rounded-full bg-surface-3" />
            <div className="mt-5 h-7 w-32 rounded-full bg-surface-3" />
            <div className="mt-3 h-2.5 w-20 rounded-full bg-surface-3" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="card-shadow rounded-[var(--radius-card)] bg-surface p-5">
            <div className="h-3.5 w-40 rounded-full bg-surface-3" />
            <div className="mt-6 space-y-3">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="h-3 rounded-full bg-surface-3" style={{ width: `${92 - row * 11}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
