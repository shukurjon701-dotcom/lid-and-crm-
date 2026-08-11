"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

/**
 * Переключатель темы.
 *
 * По умолчанию система светлая — даже если в операционной системе включён
 * тёмный режим. Иначе интерфейс сам уходит в чёрный, и это выглядит совсем
 * не так, как задумано. Выбор запоминается в браузере.
 */
export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(saved === "dark" ? "dark" : "light");
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("lid_theme", next);
    setTheme(next);
  }

  if (!ready) return <span className="size-9" />;

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? labels.light : labels.dark}
      aria-label={theme === "dark" ? labels.light : labels.dark}
      className="grid size-9 place-items-center rounded-full border border-line bg-surface text-ink-2 transition hover:border-line-strong hover:text-ink"
    >
      {theme === "dark" ? (
        <Sun className="size-4" strokeWidth={2.2} />
      ) : (
        <Moon className="size-4" strokeWidth={2.2} />
      )}
    </button>
  );
}
