/**
 * Подключение к Bitrix24 — источник данных для Call-центра и отделов продаж.
 *
 *   npm run import:bitrix -- --explore   # посмотреть, что отдаёт портал
 *   npm run import:bitrix                # перенести в базу (после --explore)
 *
 * Доступ — через входящий вебхук, без OAuth. В .env:
 *   BITRIX_WEBHOOK="https://ваш-портал.bitrix24.uz/rest/1/секретный_код/"
 *
 * Код вебхука секретный: он даёт доступ к порталу с правами создавшего его
 * сотрудника в рамках выбранных прав. .env в репозиторий не попадает.
 */
const EXPLORE = process.argv.includes("--explore");

/** Разделы, которые нужны дашбордам. */
const METHODS = {
  operators: { method: "user.get", params: { ACTIVE: true } },
  leads: { method: "crm.lead.list", params: { select: ["*"] } },
  deals: { method: "crm.deal.list", params: { select: ["*"] } },
  activities: { method: "crm.activity.list", params: { select: ["*"] } },
  calls: { method: "voximplant.statistic.get", params: {} },
  leadStatuses: { method: "crm.status.list", params: { filter: { ENTITY_ID: "STATUS" } } },
  sources: { method: "crm.status.list", params: { filter: { ENTITY_ID: "SOURCE" } } },
} as const;

function webhookBase(): string {
  const raw = process.env.BITRIX_WEBHOOK;
  if (!raw) {
    console.error(
      "\nНе задан BITRIX_WEBHOOK в .env.\n" +
        "Создайте входящий вебхук в Bitrix24 (Приложения → Разработчикам →\n" +
        "Другое → Входящий вебхук) и вставьте выданный адрес целиком:\n" +
        '  BITRIX_WEBHOOK="https://ваш-портал.bitrix24.uz/rest/1/код/"\n'
    );
    process.exit(1);
  }
  return raw.replace(/\/+$/, "");
}

type BitrixResponse<T> = {
  result?: T;
  total?: number;
  next?: number;
  error?: string;
  error_description?: string;
};

/** Вызов метода. Bitrix отдаёт ошибки в теле ответа, а не кодом HTTP. */
async function call<T>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<BitrixResponse<T>> {
  const response = await fetch(`${webhookBase()}/${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = (await response.json()) as BitrixResponse<T>;
  if (data.error) {
    throw new Error(
      `${method}: ${data.error} — ${data.error_description ?? "нет описания"}`
    );
  }
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Постраничная выгрузка. Bitrix отдаёт по 50 записей и возвращает `next` —
 * смещение для следующей страницы.
 */
async function fetchAll(
  method: string,
  params: Record<string, unknown> = {},
  limit = 5000
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let start = 0;

  for (;;) {
    const page = await call<Record<string, unknown>[] | Record<string, unknown>>(method, {
      ...params,
      start,
    });

    const result = page.result;
    const items = Array.isArray(result)
      ? result
      : result && typeof result === "object"
        ? Object.values(result as Record<string, Record<string, unknown>>)
        : [];

    all.push(...items);

    if (page.next === undefined || items.length === 0 || all.length >= limit) break;
    start = page.next;
    await sleep(200); // Bitrix ограничивает частоту запросов
  }

  return all;
}

/** Разведка: что за данные лежат на портале и какие у них поля. */
async function explore() {
  console.log(`\nПортал: ${webhookBase().replace(/\/rest\/.*/, "")}`);

  for (const [title, config] of Object.entries(METHODS)) {
    try {
      const page = await call<Record<string, unknown>[]>(config.method, {
        ...config.params,
        start: 0,
      });
      const result = page.result;
      const items = Array.isArray(result)
        ? result
        : result && typeof result === "object"
          ? Object.values(result as Record<string, Record<string, unknown>>)
          : [];

      console.log(`\n${title.padEnd(13)} ${config.method}`);
      console.log(`   ✓ записей: ${page.total ?? items.length}`);

      const first = items[0];
      if (first && typeof first === "object") {
        const fields = Object.entries(first as Record<string, unknown>)
          .slice(0, 16)
          .map(([key, value]) => {
            const preview =
              value === null || value === ""
                ? "—"
                : typeof value === "object"
                  ? Array.isArray(value)
                    ? `[${value.length}]`
                    : "{…}"
                  : String(value).slice(0, 20);
            return `${key}=${preview}`;
          });
        console.log(`   поля: ${fields.join(", ")}`);
      }
    } catch (e) {
      console.log(`\n${title.padEnd(13)} ${config.method}`);
      console.log(`   ✗ ${e instanceof Error ? e.message : e}`);
    }
    await sleep(200);
  }

  console.log(
    "\nПо этим полям настраивается перенос:\n" +
      "  лиды и их статусы  → «Лиды» и «Качественные лиды»\n" +
      "  звонки телефонии   → «Звонки за день», «Call dars», рейтинг операторов\n" +
      "  сделки             → «Продажи online / offline»\n" +
      "  встречи            → «Визиты в офис»\n"
  );
}

async function main() {
  if (EXPLORE) {
    await explore();
    return;
  }

  // Проверка связи перед полноценным переносом
  const profile = await call<Record<string, unknown>>("profile");
  console.log(`\nСвязь с Bitrix24 есть: ${JSON.stringify(profile.result).slice(0, 120)}`);
  console.log(
    "\nПеренос ещё не настроен: сначала запустите с --explore,\n" +
      "чтобы увидеть статусы лидов и поля вашего портала.\n"
  );
  void fetchAll;
}

main().catch((e) => {
  console.error("\nОшибка:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};
