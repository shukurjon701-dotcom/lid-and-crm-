/**
 * Перенос данных Bitrix24 → CRM: звонки, лиды, визиты, операторы.
 *
 *   npm run sync:bitrix -- --dry-run    # показать, что придёт
 *   npm run sync:bitrix                 # перенести
 *   npm run sync:bitrix -- --days=180   # глубина выгрузки (по умолчанию 90 дней)
 *
 * Bitrix — источник по работе call-центра. Ученики и деньги берутся из Sahab,
 * поэтому здесь переписываются только лиды, звонки и визиты.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { LeadSource, LeadStatus } from "@/types/domain";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const DAYS = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 90);
const BRANCH_ID = "branch-main";

/** Разговор дольше пяти минут считаем консультацией-уроком (Call dars). */
const LESSON_SECONDS = 300;

// --------------------------------------------------- статусы вашего портала
const STATUS_MAP: Record<string, LeadStatus> = {
  NEW: "NEW",
  IN_PROCESS: "IN_PROGRESS", // Yangi Lead
  PROCESSED: "NO_ANSWER", // Ko'tarmadi
  "1": "IN_PROGRESS", // Qayta aloqa
  "2": "IN_PROGRESS", // O'ylab ko'radi
  UC_FO6DQM: "VISIT_PLANNED", // Sinov darsiga yozilganlar (Online)
  "3": "VISIT_PLANNED", // Sinov darsiga yozilganlar (Offline)
  UC_OHM7GC: "VISITED", // Online sinovda
  UC_GRSM7S: "LOST", // Kirmadi
  "4": "LOST", // Kelmadi
  UC_7FG2X2: "LOST", // atmen
  "6": "LOST", // Keyinroq o'qidi
  CONVERTED: "CONVERTED", // Keldi/Kirdi
  UC_ZXVK0U: "CONVERTED", // Eski o'quvchi
  JUNK: "REJECTED", // Bekor bo'ldi
  "5": "REJECTED", // Sifatsiz lead
};

/** Некачественные — по вашей же разметке. Остальные считаются целевыми. */
const NOT_QUALIFIED = new Set(["5", "JUNK"]);

/** Онлайн-ветка воронки */
const ONLINE_STATUSES = new Set(["UC_FO6DQM", "UC_OHM7GC"]);

const SOURCE_MAP: Record<string, LeadSource> = {
  CALL: "INBOUND_CALL",
  UC_F30Z4A: "INBOUND_CALL",
  CALLBACK: "INBOUND_CALL",
  WEB: "WEBSITE",
  WEBFORM: "WEBSITE",
  STORE: "WEBSITE",
  BOOKING: "WEBSITE",
  REPEAT_SALE: "FACEBOOK", // Facebook lead form
  ADVERTISING: "INSTAGRAM",
  RECOMMENDATION: "REFERRAL",
  PARTNER: "REFERRAL",
  EMAIL: "OTHER",
  TRADE_SHOW: "WALK_IN",
};

// ------------------------------------------------------------------ доступ
function webhook(): string {
  const raw = process.env.BITRIX_WEBHOOK;
  if (!raw) throw new Error("Не задан BITRIX_WEBHOOK в .env");
  return raw.replace(/\/+$/, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(method: string, params: Record<string, unknown> = {}) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${webhook()}/${method}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      });
    } catch {
      // обрыв связи на длинной выгрузке — ждём и пробуем снова
      if (attempt === 5) throw new Error(`${method}: связь с Bitrix потеряна`);
      await sleep(attempt * 3000);
      continue;
    }
    const data = (await response.json()) as {
      result?: T;
      total?: number;
      next?: number;
      error?: string;
      error_description?: string;
    };
    if (!data.error) return data;
    // QUERY_LIMIT_EXCEEDED — подождать и повторить
    if (attempt < 5 && /LIMIT|OVERLOAD/i.test(data.error)) {
      await sleep(attempt * 2000);
      continue;
    }
    throw new Error(`${method}: ${data.error} — ${data.error_description ?? ""}`);
  }
  throw new Error(`${method}: не удалось получить ответ`);
}

async function fetchAll(
  method: string,
  params: Record<string, unknown> = {},
  label = ""
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let start = 0;
  let total = 0;

  for (;;) {
    const page = await call<Record<string, unknown>[] | Record<string, unknown>>(method, {
      ...params,
      start,
    });
    total = page.total ?? total;
    const result = page.result;
    const items = Array.isArray(result)
      ? result
      : result && typeof result === "object"
        ? Object.values(result as Record<string, Record<string, unknown>>)
        : [];

    all.push(...items);
    if (label && all.length % 1000 < 50) {
      process.stdout.write(`\r  ${label}: ${all.length}${total ? ` из ${total}` : ""}   `);
    }

    if (page.next === undefined || items.length === 0) break;
    start = page.next;
    await sleep(120);
  }

  if (label) process.stdout.write(`\r  ${label}: ${all.length}          \n`);
  return all;
}


/**
 * Имя сотрудника. В Bitrix часть учёток заведена без имени — там остаются
 * служебные заглушки вроде REG_ADMIN_FIRST_NAME. Для таких ставим точку,
 * чтобы в отчётах не мелькал технический мусор.
 */
function staffName(user: Record<string, unknown>): string {
  const parts = [user.NAME, user.LAST_NAME]
    .map((v) => String(v ?? "").trim())
    .filter((v) => v && !/^REG_ADMIN/i.test(v));
  const name = parts.join(" ").trim();
  return name || ".";
}

const asDate = (value: unknown): Date | null => {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(+d) ? null : d;
};

// =================================================================== перенос
async function main() {
  const since = new Date();
  since.setDate(since.getDate() - DAYS);
  const sinceIso = since.toISOString().slice(0, 19);

  console.log(`\nПортал: ${webhook().replace(/\/rest\/.*/, "")}`);
  console.log(`Глубина выгрузки: ${DAYS} дней (с ${since.toLocaleDateString("ru-RU")})\n`);

  const users = await fetchAll("user.get", {}, "сотрудники");
  const leads = await fetchAll(
    "crm.lead.list",
    {
      filter: { ">=DATE_CREATE": sinceIso },
      select: ["ID", "TITLE", "NAME", "LAST_NAME", "STATUS_ID", "SOURCE_ID", "ASSIGNED_BY_ID", "DATE_CREATE", "DATE_MODIFY", "PHONE"],
      order: { DATE_CREATE: "DESC" },
    },
    "лиды"
  );
  const calls = await fetchAll(
    "voximplant.statistic.get",
    { FILTER: { ">=CALL_START_DATE": sinceIso }, SORT: "CALL_START_DATE", ORDER: "DESC" },
    "звонки"
  );

  // Общее число звонков за всё время — для метрики «Umumiy qo'ng'iroq soni»
  const callsTotalAll = (await call<unknown[]>("voximplant.statistic.get", {})).total ?? calls.length;

  // ------------------------------------------------------------- сводка
  const statusCount = new Map<string, number>();
  for (const lead of leads) {
    const id = String(lead.STATUS_ID);
    statusCount.set(id, (statusCount.get(id) ?? 0) + 1);
  }
  const qualified = leads.filter((l) => !NOT_QUALIFIED.has(String(l.STATUS_ID))).length;
  const talkSeconds = calls.reduce((a, c) => a + Number(c.CALL_DURATION ?? 0), 0);

  console.log(`\nСотрудники: ${users.length}`);
  console.log(`Лиды за период: ${leads.length}, из них целевых ${qualified}`);
  console.log(`Звонки за период: ${calls.length} (всего на портале ${callsTotalAll})`);
  console.log(`  наговорено ${Math.round(talkSeconds / 3600)} часов`);
  console.log(
    `  консультаций дольше 5 минут: ${calls.filter((c) => Number(c.CALL_DURATION ?? 0) >= LESSON_SECONDS).length}`
  );

  if (DRY_RUN) {
    console.log("\nСтатусы лидов за период:");
    for (const [id, n] of [...statusCount.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`   ${id.padEnd(12)} ${String(n).padStart(5)}  → ${STATUS_MAP[id] ?? "не сопоставлен"}`);
    }
    console.log("\n--dry-run: в базу ничего не записано.\n");
    return;
  }

  // ------------------------------------------------------------ операторы
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: BRANCH_ID } });
  const fallback = await prisma.user.findFirstOrThrow({
    where: { branchId: branch.id, role: "BRANCH_ADMIN" },
  });

  const operatorByBitrixId = new Map<string, string>();
  for (const user of users) {
    const fullName = staffName(user);
    const login = `bitrix-${user.ID}`;
    const existing =
      (await prisma.user.findUnique({ where: { login } })) ??
      (await prisma.user.create({
        data: {
          login,
          fullName,
          passwordHash: "!", // вход отключён: учётка нужна только для отчётов
          role: "OPERATOR",
          branchId: branch.id,
          isActive: user.ACTIVE !== false,
        },
      }));
    operatorByBitrixId.set(String(user.ID), existing.id);
  }

  console.log("\nОчищаю прежние лиды, звонки и визиты...");
  await prisma.$transaction([
    prisma.visit.deleteMany(),
    prisma.callLog.deleteMany(),
    prisma.lead.deleteMany(),
  ]);

  // ---------------------------------------------------------------- лиды
  console.log("Записываю лиды...");

  // Пакетная вставка: при работе с удалённой базой тысячи отдельных запросов
  // рвут соединение, поэтому пишем пачками по 500 строк.
  const leadRows: unknown[] = [];
  const visitRows: unknown[] = [];

  for (const lead of leads) {
    const statusId = String(lead.STATUS_ID);
    const status = STATUS_MAP[statusId] ?? "NEW";
    const createdAt = asDate(lead.DATE_CREATE) ?? new Date();
    const phones = Array.isArray(lead.PHONE)
      ? (lead.PHONE as { VALUE?: string }[]).map((p) => p.VALUE).filter(Boolean)
      : [];
    const fullName =
      [lead.NAME, lead.LAST_NAME].filter(Boolean).join(" ").trim() ||
      String(lead.TITLE ?? "").trim() ||
      "Без имени";

    const id = randomUUID();
    const operatorId = operatorByBitrixId.get(String(lead.ASSIGNED_BY_ID)) ?? fallback.id;

    leadRows.push({
      id,
      branchId: branch.id,
      fullName: fullName.slice(0, 180),
      phone: phones[0] ?? "—",
      source: SOURCE_MAP[String(lead.SOURCE_ID)] ?? "OTHER",
      status,
      isQualified: !NOT_QUALIFIED.has(statusId),
      operatorId,
      createdAt,
      convertedAt: status === "CONVERTED" ? (asDate(lead.DATE_MODIFY) ?? createdAt) : null,
      comment: `Bitrix24 #${lead.ID}`,
    });

    if (status === "VISIT_PLANNED" || status === "VISITED" || status === "CONVERTED") {
      const arrived = status !== "VISIT_PLANNED";
      const at = asDate(lead.DATE_MODIFY) ?? createdAt;
      visitRows.push({
        branchId: branch.id,
        leadId: id,
        invitedById: operatorId,
        scheduledAt: at,
        arrivedAt: arrived ? at : null,
        didArrive: arrived,
        resultSale: status === "CONVERTED",
        note: ONLINE_STATUSES.has(statusId) ? "Online sinov" : "Offline sinov",
      });
    }
  }

  const chunk = <T>(rows: T[], size = 500) =>
    Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
      rows.slice(i * size, (i + 1) * size)
    );

  for (const part of chunk(leadRows)) {
    await prisma.lead.createMany({ data: part as never, skipDuplicates: true });
  }
  for (const part of chunk(visitRows)) {
    await prisma.visit.createMany({ data: part as never, skipDuplicates: true });
  }

  // -------------------------------------------------------------- звонки
  console.log("Записываю звонки...");
  const callRows = calls
    .map((item) => {
      const startedAt = asDate(item.CALL_START_DATE);
      if (!startedAt) return null;
      const duration = Number(item.CALL_DURATION ?? 0);
      const failed = String(item.CALL_FAILED_CODE ?? "200") !== "200";
      return {
        branchId: branch.id,
        operatorId: operatorByBitrixId.get(String(item.PORTAL_USER_ID)) ?? fallback.id,
        phone: String(item.PHONE_NUMBER ?? "—"),
        type: String(item.CALL_TYPE) === "2" ? "INCOMING" : "OUTGOING",
        result: failed ? "NO_ANSWER" : duration > 0 ? "ANSWERED" : "NO_ANSWER",
        durationSeconds: duration,
        isLesson: duration >= LESSON_SECONDS,
        calledAt: startedAt,
        recordingUrl: (item.CALL_RECORD_URL as string) || null,
      };
    })
    .filter(Boolean);

  for (const part of chunk(callRows, 1000)) {
    await prisma.callLog.createMany({ data: part as never, skipDuplicates: true });
  }
  const written = callRows.length;

  console.log("\n─────────────── Загружено ───────────────");
  console.log(`  Операторы  ${operatorByBitrixId.size}`);
  console.log(`  Лиды       ${leadRows.length} (целевых ${qualified})`);
  console.log(`  Звонки     ${written}`);
  console.log(`  Визиты     ${await prisma.visit.count()}`);
  console.log("\nОткройте http://localhost:3000/call-center\n");
}

main()
  .catch((e) => {
    console.error("\nОшибка:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
