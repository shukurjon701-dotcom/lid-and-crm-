/**
 * Сотрудники портала Bitrix24: имя → список ID.
 *
 * Нужен там, где сотруднику возвращают «пустой» вход: логин `bitrix-<ID>` —
 * это метка, по которой синхронизация узнаёт свою запись. Без неё следующий
 * `sync:bitrix` заведёт человека заново, и его звонки разойдутся по двум
 * записям.
 *
 * На одно имя в Bitrix бывает несколько учёток, поэтому храним все ID.
 */
export async function bitrixStaff(): Promise<Map<string, string[]>> {
  const webhook = process.env.BITRIX_WEBHOOK?.replace(/\/+$/, "");
  if (!webhook) return new Map();

  const byName = new Map<string, string[]>();
  let start = 0;
  for (;;) {
    const response = await fetch(`${webhook}/user.get.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start }),
    });
    const data = (await response.json()) as {
      result?: Record<string, unknown>[];
      next?: number;
    };
    for (const user of data.result ?? []) {
      const name = [user.NAME, user.LAST_NAME]
        .map((v) => String(v ?? "").trim())
        .filter((v) => v && !/^REG_ADMIN/i.test(v))
        .join(" ")
        .trim();
      if (!name) continue;
      const key = name.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), String(user.ID)]);
    }
    if (data.next === undefined) break;
    start = data.next;
  }
  return byName;
}
