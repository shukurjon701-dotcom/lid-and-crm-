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

/** Разговор дольше пяти минут считаем консультацией. */
const LESSON_SECONDS = 300;

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
  calls: number;
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

  const staff = await prisma.user.findMany({
    where: { login: { startsWith: "bitrix-" } },
    select: { id: true, login: true },
  });
  const operatorId = (bitrixUserId: unknown) =>
    staff.find((u) => u.login === `bitrix-${bitrixUserId}`)?.id ?? fallback.id;

  const [calls, leads] = await Promise.all([
    bitrixAll("voximplant.statistic.get", {
      FILTER: { ">=CALL_START_DATE": sinceIso },
      SORT: "CALL_START_DATE",
      ORDER: "DESC",
    }),
    bitrixAll("crm.lead.list", {
      filter: { ">=DATE_CREATE": sinceIso },
      select: ["ID", "TITLE", "NAME", "LAST_NAME", "STATUS_ID", "SOURCE_ID", "ASSIGNED_BY_ID", "DATE_CREATE", "DATE_MODIFY", "PHONE"],
      order: { DATE_CREATE: "DESC" },
    }),
  ]);

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
    prisma.callLog.deleteMany({ where: { branchId: branch.id, calledAt: { gte: since } } }),
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

  const callRows = calls
    .map((item) => {
      const startedAt = asDate(item.CALL_START_DATE);
      if (!startedAt) return null;
      const duration = Number(item.CALL_DURATION ?? 0);
      const failed = String(item.CALL_FAILED_CODE ?? "200") !== "200";
      return {
        branchId: branch.id,
        operatorId: operatorId(item.PORTAL_USER_ID),
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
  for (const part of chunk(callRows, 1000)) {
    await prisma.callLog.createMany({ data: part as never, skipDuplicates: true });
  }

  return {
    calls: callRows.length,
    leads: leadRows.length,
    visits: visitRows.length,
    since,
    finishedAt: new Date(),
  };
}

void API_BASE;
