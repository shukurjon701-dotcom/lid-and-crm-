"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LANGS, LANG_SHORT, type Lang } from "@/lib/i18n";

/**
 * Переключатель языка. Выбор хранится в cookie, поэтому язык держится
 * между заходами и одинаков на всех страницах.
 */
export function LangSwitch({ current }: { current: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(lang: Lang) {
    if (lang === current) return;
    document.cookie = `lid_lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5",
        pending && "opacity-60"
      )}
      role="group"
      aria-label="Til / Язык"
    >
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => pick(lang)}
          aria-pressed={lang === current}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-extrabold transition",
            lang === current
              ? "bg-accent text-accent-ink"
              : "text-ink-3 hover:text-ink"
          )}
        >
          {LANG_SHORT[lang]}
        </button>
      ))}
    </div>
  );
}
