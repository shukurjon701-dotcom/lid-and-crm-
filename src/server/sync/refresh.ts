import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { APP } from "@/config/app";
import type { LeadSource, LeadStatus } from "@/types/domain";

/**
 * Быстрое обновление данных Bitrix за последние дни.
 *
 * Полная выгрузка за 90 дней идёт минутами и не годится ни для кнопки,
 * ни для расписания. Здесь берётся только свежее окно: старые записи в этом
 * окне удаляются и записываются заново, всё, что раньше, не трогается.
 */

const API_BASE = "https://api.sahab.uz";

const STATUS_MAP: Record<string, LeadStatus> = {
  NEW: "NEW",
  IN_PROCESS: "IN_PROGRESS",
  PROCESSED: "NO_ANSWER",
  "1": "IN_PROGRESS",
  "2": "IN_PROGRESS",
  UC_FO6DQM: "VISIT_PLANNED",
  "3": "VISIT_PLANNED",
  UC_OHM7GC: "VISITED",
  UC_GRSM7S: "LOST",
  "4": "LOST",
  UC_7FG2X2: "LOST",
  "6": "LOST",
  CONVERTED: "CONVERTED",
  UC_ZXVK0U: "CONVERTED",
  JUNK: "REJECTED",
  "5": "REJECTED",
};

const NOT_QUALIFIED = new Set(["5", "JUNK"]);
const ONLINE_STATUSES = new Set(["UC_FO6DQM", "UC_OHM7GC"]);

const SOURCE_MAP: Record<string, LeadSource> = {
  CALL: "INBOUND_CALL",
  UC_F30Z4A: "INBOUND_CALL",
  CALLBACK: "INBOUND_CALL",
  WEB: "WEBSITE",
  WEBFORM: "WEBSITE",
  STORE: "WEBSITE",
  BOOKING: "WEBSITE",
  REPEAT_SALE: "FACEBOOK",
  ADVERTISING: "INSTAGRAM",
  RECOMMENDATION: "REFERRAL",
  PARTNER: "REFERRAL",
  EMAIL: "OTHER",
  TRADE_SHOW: "WALK_IN",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bitrix<T>(method: string, params: Record<string, unknown> = {}) {
  const webhook = process.env.BITRIX_WEBHOOK?.replace(/\/+$/, "");
  if (!webhook) throw new Error("BITRIX_WEBHOOK не задан");

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${webhook}/${method}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = (await response.json()) as {
        result?: T;
        next?: number;
        total?: number;
        error?: string;
      };
      if (!data.error) return data;
      if (attempt === 4) throw new Error(`${method}: ${data.error}`);
    } catch (error) {
      if (attempt === 4) throw error;
    }
    await sleep(attempt * 1500);
  }
  throw new Error(`${method}: не отвечает`);
}

async function bitrixAll(method: string, params: Record<string, unknown> = {}) {
  const rows: Record<string, unknown>[] = [];
  let start = 0;
  for (;;) {
    const page = await bitrix<Record<string, unknown>[]>(method, { ...params, start });
    const items = Array.isArray(page.result)
      ? page.result
      : page.result && typeof page.result === "object"
        ? Object.values(page.result as Record<string, Record<string, unknown>>)
        : [];
    rows.push(...items);
    if (page.next === undefined || items.length === 0 || rows.length > 20_000) break;
    start = page.next;
    await sleep(120);
  }
  return rows;
}

const asDate = (value: unknown) => {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(+d) ? null : d;
};

export type RefreshResult = {
  leads: number;
  visits: number;
  since: Date;
  finishedAt: Date;
};

export async function refreshBitrix(days = 3): Promise<RefreshResult> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString().slice(0, 19);

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: APP.branch.id } });
  const fallback = await prisma.user.findFirstOrThrow({
    where: { branchId: branch.id, role: "BRANCH_ADMIN" },
    select: { id: true },
  });

  // Сотрудников заводим по списку из Bitrix: если запись потерялась или
  // появился новый оператор, его звонки иначе свалятся на администратора
  // и покажут неверную статистику.
  const portalUsers = await bitrixAll("user.get", {});
  const staff = new Map<string, string>();

  for (const user of portalUsers) {
    const login = `bitrix-${user.ID}`;
    const name =
      [user.NAME, user.LAST_NAME]
        .map((v) => String(v ?? "").trim())
        .filter((v) => v && !/^REG_ADMIN/i.test(v))
        .join(" ")
        .trim() || ".";

    const existing =
      (await prisma.user.findUnique({ where: { login }, select: { id: true } })) ??
      (await prisma.user.create({
        data: {
          login,
          fullName: name,
          passwordHash: "!", // вход создаётся только самим сотрудником
          role: "OPERATOR",
          branchId: branch.id,
          isActive: user.ACTIVE !== false,
        },
        select: { id: true },
      }));
    staff.set(String(user.ID), existing.id);
  }

  const operatorId = (bitrixUserId: unknown) =>
    staff.get(String(bitrixUserId)) ?? fallback.id;

  // Звонки берутся из onlinePBX (src/server/sync/pbx.ts): в Битрикс попадала
  // лишь часть вызовов и нередко с чужим владельцем.
  const leads = await bitrixAll("crm.lead.list", {
    filter: { ">=DATE_CREATE": sinceIso },
    select: ["ID", "TITLE", "NAME", "LAST_NAME", "STATUS_ID", "SOURCE_ID", "ASSIGNED_BY_ID", "DATE_CREATE", "DATE_MODIFY", "PHONE"],
    order: { DATE_CREATE: "DESC" },
  });

  // Заменяем только свежее окно — история остаётся нетронутой
  const leadIds = (
    await prisma.lead.findMany({
      where: { branchId: branch.id, createdAt: { gte: since } },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.$transaction([
    prisma.visit.deleteMany({ where: { leadId: { in: leadIds } } }),
    prisma.lead.deleteMany({ where: { id: { in: leadIds } } }),
  ]);

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
    const owner = operatorId(lead.ASSIGNED_BY_ID);

    leadRows.push({
      id,
      branchId: branch.id,
      fullName: fullName.slice(0, 180),
      phone: phones[0] ?? "—",
      source: SOURCE_MAP[String(lead.SOURCE_ID)] ?? "OTHER",
      status,
      isQualified: !NOT_QUALIFIED.has(statusId),
      operatorId: owner,
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
        invitedById: owner,
        scheduledAt: at,
        arrivedAt: arrived ? at : null,
        didArrive: arrived,
        resultSale: status === "CONVERTED",
        note: ONLINE_STATUSES.has(statusId) ? "Online sinov" : "Offline sinov",
      });
    }
  }

  const chunk = <T>(rows: T[], size: number) =>
    Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
      rows.slice(i * size, (i + 1) * size)
    );

  for (const part of chunk(leadRows, 500)) {
    await prisma.lead.createMany({ data: part as never, skipDuplicates: true });
  }
  for (const part of chunk(visitRows, 500)) {
    await prisma.visit.createMany({ data: part as never, skipDuplicates: true });
  }
  return {
    leads: leadRows.length,
    visits: visitRows.length,
    since,
    finishedAt: new Date(),
  };
}

void API_BASE;

// ====================================================== ФИНАНСЫ ИЗ SAHAB
const SAHAB_API = "https://api.sahab.uz/api/v1";

async function sahabToken() {
  const tenant = process.env.SAHAB_DOMAIN || "arabicacademy.sahab.uz";
  const headers = { "Content-Type": "application/json", "x-tenant-domain": tenant };

  const response = await fetch(`${SAHAB_API}/accounts/login/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone_number: process.env.SAHAB_PHONE,
      password: process.env.SAHAB_PASSWORD,
    }),
  });
  if (!response.ok) throw new Error(`Sahab: вход не удался (${response.status})`);

  const data = (await response.json()).data as {
    access: string;
    profiles?: { type: string; id: string }[];
  };
  const auth = { ...headers, Authorization: `Bearer ${data.access}` };

  const profile = data.profiles?.[0];
  if (profile) {
    await fetch(`${SAHAB_API}/accounts/set-profile-type/`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ profile_type: profile.type, profile_id: profile.id }),
    });
  }
  return auth;
}

async function sahabAll(auth: Record<string, string>, path: string) {
  const out: Record<string, unknown>[] = [];
  let url: string | null = `${SAHAB_API}${path}?page_size=200`;
  while (url) {
    const response: Response = await fetch(url, { headers: auth });
    if (!response.ok) throw new Error(`Sahab ${path} → ${response.status}`);
    const json = (await response.json()) as Record<string, unknown>;
    const body = (json.data ?? json) as Record<string, unknown>;
    const results = body.results as Record<string, unknown> | unknown[] | undefined;
    const items = Array.isArray(body)
      ? (body as unknown[])
      : Array.isArray(results)
        ? results
        : ((results as Record<string, unknown>)?.data as unknown[]) ??
          (body.data as unknown[]) ??
          [];
    out.push(...(items as Record<string, unknown>[]));
    url = (body.next ?? json.next ?? null) as string | null;
  }
  return out;
}

const money = (value: unknown) => Number(value ?? 0);
const day = (value: unknown) => (value ? new Date(`${String(value)}T12:00:00`) : new Date());

// «Терминал» в Sahab — та же оплата картой через POS, отдельного способа нет.
const METHOD: Record<string, "CASH" | "CARD" | "TRANSFER"> = {
  naqd: "CASH",
  terminal: "CARD",
  karta: "CARD",
  kart: "CARD",
  click: "TRANSFER",
  payme: "TRANSFER",
  uzum: "TRANSFER",
};

const toMethod = (name: unknown) => {
  const key = String(name ?? "").toLowerCase().trim();
  for (const [word, value] of Object.entries(METHOD)) if (key.includes(word)) return value;
  return "CASH" as const;
};

export type FinanceResult = { payments: number; expenses: number };

/**
 * Платежи и расходы из Sahab. Их немного (сотни строк), поэтому проще
 * переписать целиком, чем вычислять разницу. Книги здесь не участвуют:
 * у них свой склад (модели Book / BookMovement) и свой импорт.
 */
export async function refreshSahabFinance(): Promise<FinanceResult> {
  if (!process.env.SAHAB_PHONE || !process.env.SAHAB_PASSWORD) {
    return { payments: 0, expenses: 0 };
  }

  const auth = await sahabToken();
  const [payments, expenses] = await Promise.all([
    sahabAll(auth, "/finance/payments/"),
    sahabAll(auth, "/finance/expenses/"),
  ]);

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: APP.branch.id } });
  const admin = await prisma.user.findFirstOrThrow({
    where: { branchId: branch.id, role: "BRANCH_ADMIN" },
    select: { id: true, fullName: true },
  });

  const students = await prisma.student.findMany({ select: { id: true, fullName: true } });
  const byName = new Map(students.map((s) => [s.fullName.trim().toLowerCase(), s.id]));

  const staff = await prisma.user.findMany({ select: { id: true, fullName: true } });
  const staffByName = new Map(staff.map((u) => [u.fullName.trim().toLowerCase(), u.id]));
  const whoever = (name: unknown) =>
    staffByName.get(String(name ?? "").trim().toLowerCase()) ?? admin.id;

  await prisma.$transaction([
    prisma.paymentAllocation.deleteMany(),
    prisma.payment.deleteMany({ where: { branchId: branch.id } }),
    prisma.expense.deleteMany({ where: { branchId: branch.id } }),
  ]);

  const paymentRows = payments.map((p) => {
    const signed = money(p.signed_amount ?? p.amount);
    return {
      branchId: branch.id,
      studentId: byName.get(String(p.student_name ?? "").trim().toLowerCase()) ?? null,
      amount: Math.abs(signed),
      direction: signed < 0 || p.kind === "refund" ? ("REFUND" as const) : ("INCOME" as const),
      method: toMethod(p.payment_method_name),
      receivedById: admin.id,
      paidAt: day(p.date),
      comment: (p.note as string) || null,
    };
  });

  for (let i = 0; i < paymentRows.length; i += 500) {
    await prisma.payment.createMany({ data: paymentRows.slice(i, i + 500), skipDuplicates: true });
  }

  // категории расходов
  const categories = new Map<string, string>();
  for (const expense of expenses) {
    const name = String(expense.category_name ?? "Прочее").trim() || "Прочее";
    if (categories.has(name)) continue;
    const existing =
      (await prisma.expenseCategory.findFirst({ where: { branchId: branch.id, name } })) ??
      (await prisma.expenseCategory.create({ data: { branchId: branch.id, name } }));
    categories.set(name, existing.id);
  }

  const expenseRows = expenses.map((e) => {
    const name = String(e.category_name ?? "Прочее").trim() || "Прочее";
    return {
      branchId: branch.id,
      categoryId: categories.get(name)!,
      title: e.recipient ? `${name} — ${e.recipient}` : name,
      amount: money(e.amount),
      method: toMethod(e.payment_method_name),
      createdById: whoever(e.received_by_name),
      spentAt: day(e.date),
      description: (e.note as string) || null,
    };
  });

  for (let i = 0; i < expenseRows.length; i += 500) {
    await prisma.expense.createMany({ data: expenseRows.slice(i, i + 500), skipDuplicates: true });
  }

  return { payments: paymentRows.length, expenses: expenseRows.length };
}
