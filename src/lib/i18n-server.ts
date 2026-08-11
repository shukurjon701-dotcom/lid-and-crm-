import { cookies } from "next/headers";
import { DEFAULT_LANG, LANGS, LANG_COOKIE, translator, type Lang } from "@/lib/i18n";

/**
 * Чтение языка из cookie вынесено отдельно: сам словарь нужен и клиентским
 * компонентам, а `next/headers` в них импортировать нельзя.
 */
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return LANGS.includes(value as Lang) ? (value as Lang) : DEFAULT_LANG;
}

/** Готовый переводчик для серверного компонента: `const t = await getT()` */
export async function getT() {
  return translator(await getLang());
}
