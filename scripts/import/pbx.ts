/**
 * Выгрузка истории звонков из onlinePBX в базу CRM.
 *
 *   npm run sync:pbx              — последние 7 суток
 *   npm run sync:pbx -- --days=30 — глубже назад
 *   npm run sync:pbx -- --users   — только список внутренних номеров
 *   npm run sync:pbx -- --dry-run — показатели операторов без записи в базу
 *
 * Кнопка «Обновить» в интерфейсе делает то же самое за трое суток
 * (src/server/sync/pbx.ts), скрипт нужен для первичного заполнения.
 */
import { classifyCall, fetchPbxCalls, fetchPbxUsers, refreshPbxCalls } from "../../src/server/sync/pbx";

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = Math.min(Math.max(Number(daysArg?.split("=")[1] ?? 7), 1), 180);

  if (process.argv.includes("--users")) {
    const users = await fetchPbxUsers();
    console.table(users.map((u) => ({ номер: u.num, сотрудник: u.name, включён: u.enabled })));
    return;
  }

  // Предпросмотр: те же цифры, что попадут в таблицу «Операторы»,
  // но база не трогается — удобно сверить с панелью onlinePBX.
  if (process.argv.includes("--dry-run")) {
    const users = await fetchPbxUsers();
    const names = new Map(users.map((u) => [String(u.num), u.name]));
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const calls = await fetchPbxCalls(since, new Date());
    const stats = new Map<string, { звонки: number; отвечено: number; call_dars: number; секунды: number }>();

    for (const call of calls) {
      const facts = classifyCall(call, new Set(names.keys()));
      if (!facts) continue;
      const day = facts.calledAt.toLocaleDateString("ru-RU");
      const key = `${day} · ${names.get(facts.extension) ?? facts.extension}`;
      const row = stats.get(key) ?? { звонки: 0, отвечено: 0, call_dars: 0, секунды: 0 };
      row.звонки += 1;
      if (facts.result === "ANSWERED") row.отвечено += 1;
      if (facts.isLesson) row.call_dars += 1;
      row.секунды += facts.talkSeconds;
      stats.set(key, row);
    }

    console.table(
      Object.fromEntries(
        [...stats.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, { секунды, ...row }]) => [
            key,
            { ...row, "в разговоре, мин": Math.round(секунды / 60) },
          ])
      )
    );
    console.log(`Всего в истории АТС: ${calls.length} звонков за ${days} сут`);
    return;
  }

  console.log(`Загружаю звонки из onlinePBX за ${days} сут…`);
  const result = await refreshPbxCalls(days);
  console.log(
    `Готово: ${result.pbxCalls} звонков, ${result.pbxOperators} операторов, ` +
      `с ${result.pbxSince.toLocaleDateString("ru-RU")}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
