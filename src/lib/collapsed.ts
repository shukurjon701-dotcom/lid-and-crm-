/**
 * Свёрнутые блоки дашбордов.
 *
 * Состояние держится в cookie, а не в localStorage: страницы рисуются на
 * сервере, и он должен знать, что свёрнуто, до первой отрисовки. Иначе
 * свёрнутый блок успевает мелькнуть и страница дёргается при загрузке.
 *
 * Разбор cookie вынесен сюда отдельно от компонента: сам компонент
 * клиентский, а `next/headers` читается только на сервере.
 */

export const COLLAPSED_COOKIE = "lid_collapsed";

/** Год: состояние блоков — настройка рабочего места, а не сессии. */
export const COLLAPSED_MAX_AGE = 60 * 60 * 24 * 365;

/** Идентификаторы блоков — латиница, точки и двоеточия, кодировать нечего. */
const SEPARATOR = "~";

export function parseCollapsed(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(SEPARATOR).filter(Boolean);
}

export function serializeCollapsed(ids: string[]): string {
  return ids.join(SEPARATOR);
}
