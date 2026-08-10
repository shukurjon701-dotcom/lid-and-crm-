/** Поиск, фильтрация и постраничный вывод для списочных разделов. */

export const PER_PAGE = 50;

export type ListParams = { q?: string; page?: string; filter?: string };

/** Поиск без учёта регистра по нескольким полям записи. */
export function search<T>(rows: T[], query: string | undefined, fields: (row: T) => (string | null | undefined)[]): T[] {
  const q = query?.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    fields(row).some((value) => value?.toLowerCase().includes(q))
  );
}

export function paginate<T>(rows: T[], page: number, perPage = PER_PAGE) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(page, 1), pages);
  return {
    items: rows.slice((current - 1) * perPage, current * perPage),
    total,
    pages,
    page: current,
    from: total === 0 ? 0 : (current - 1) * perPage + 1,
    to: Math.min(current * perPage, total),
  };
}

export const pageNumber = (value: string | undefined) => {
  const n = Number(value ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
};
