import "server-only";
import { buildDemoDataset } from "@/server/data/demo";
import type { Dataset } from "@/server/data/types";
import type { Role } from "@/types/domain";

/**
 * Источник данных.
 *
 * Есть Postgres  → читаем из него через Prisma.
 * Нет Postgres   → детерминированный демо-набор, приложение всё равно работает.
 *
 * Метрики (src/server/metrics) не знают, откуда пришёл Dataset.
 */

let demoCache: { key: string; data: Dataset } | null = null;
let dbProbe: { at: number; ready: boolean } | null = null;
const PROBE_TTL_MS = 15_000;

/** Ленивая загрузка Prisma: без сгенерированного клиента импорт бросает — это нормально. */
async function getPrisma() {
  const mod = await import("@/lib/prisma");
  return mod.prisma;
}

export async function isDatabaseReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    warnOnce("DATABASE_URL не задана — показываю демо-данные");
    return false;
  }
  if (dbProbe && Date.now() - dbProbe.at < PROBE_TTL_MS) return dbProbe.ready;

  let ready = false;
  try {
    const prisma = await getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    ready = true;
  } catch (error) {
    // Молчаливый откат на демо мешает понять, что случилось на сервере,
    // поэтому причину пишем в лог — она видна в Render → Logs.
    warnOnce(
      `Не удалось подключиться к базе, показываю демо-данные: ${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }`
    );
    ready = false;
  }
  dbProbe = { at: Date.now(), ready };
  return ready;
}

let lastWarning = "";
function warnOnce(message: string) {
  if (message === lastWarning) return;
  lastWarning = message;
  console.warn(`[данные] ${message}`);
}

export async function findDbUserByLogin(login: string): Promise<{
  id: string;
  login: string;
  fullName: string;
  role: Role;
  passwordHash: string;
} | null> {
  try {
    const prisma = await getPrisma();
    const user = await prisma.user.findFirst({
      where: { login: login.trim().toLowerCase(), isActive: true },
      select: { id: true, login: true, fullName: true, role: true, passwordHash: true },
    });
    return user as never;
  } catch {
    return null;
  }
}

export async function getDataset(): Promise<Dataset> {
  if (await isDatabaseReady()) {
    try {
      return await loadFromDatabase();
    } catch {
      // БД поднята, но пустая или несовместимая — не роняем интерфейс
    }
  }

  const key = new Date().toDateString();
  if (!demoCache || demoCache.key !== key) {
    demoCache = { key, data: buildDemoDataset() };
  }
  return demoCache.data;
}

/** Чтение снимка из Postgres. Для одного филиала объём маленький — агрегируем в TS. */
async function loadFromDatabase(): Promise<Dataset> {
  const prisma = await getPrisma();
  const num = (v: unknown) => (v == null ? 0 : Number(v));

  const [students, leads, calls, visits, payments, expenses, groups, audit, operators, staff] =
    await Promise.all([
      prisma.student.findMany({
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            include: { group: { include: { course: true } } },
            take: 1,
          },
          admin: { select: { fullName: true } },
        },
      }),
      prisma.lead.findMany({
        include: { operator: { select: { id: true, fullName: true } }, course: true },
        orderBy: { createdAt: "desc" },
        take: 6000,
      }),
      prisma.callLog.findMany({
        include: { operator: { select: { id: true, fullName: true } }, lead: true },
        orderBy: { calledAt: "desc" },
        take: 5000,
      }),
      prisma.visit.findMany({
        include: { lead: true, invitedBy: { select: { id: true, fullName: true } } },
        orderBy: { scheduledAt: "desc" },
        take: 1000,
      }),
      prisma.payment.findMany({
        where: { voidedAt: null },
        include: { student: true, receivedBy: { select: { fullName: true } } },
        orderBy: { paidAt: "desc" },
        take: 3000,
      }),
      prisma.expense.findMany({
        where: { voidedAt: null },
        include: { category: true, createdBy: { select: { fullName: true } } },
        orderBy: { spentAt: "desc" },
        take: 1000,
      }),
      prisma.group.findMany({
        where: { status: "ACTIVE" },
        include: {
          course: true,
          teacher: { select: { fullName: true } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.user.findMany({
        where: { role: "OPERATOR", isActive: true },
        select: { id: true, fullName: true },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          fullName: true,
          login: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
        orderBy: { fullName: "asc" },
      }),
    ]);

  return {
    isDemo: false,
    generatedAt: new Date(),
    lastCallAt: calls[0]?.calledAt ?? null,
    students: students.map((s) => {
      const enrollment = s.enrollments[0];
      return {
        id: s.id,
        publicId: s.publicId,
        fullName: s.fullName,
        phone: s.phone,
        courseName: enrollment?.group.course.name ?? "—",
        groupId: enrollment?.groupId ?? "—",
        groupName: enrollment?.group.name ?? "Без группы",
        status: s.status,
        source: s.source,
        saleChannel: s.saleChannel ?? "OFFLINE",
        startedAt: s.startedAt,
        frozenAt: s.frozenAt,
        leftAt: s.leftAt,
        leftReason: s.leftReason,
        debtSince: s.debtSince,
        balance: num(s.balance),
        monthlyPrice: num(enrollment?.group.monthlyPrice ?? enrollment?.group.course.monthlyPrice),
        lessonsAttended: enrollment?.lessonsAttended ?? 0,
        firstLessonAt: enrollment?.firstLessonAt ?? null,
        secondLessonAt: enrollment?.secondLessonAt ?? null,
        thirdLessonAt: enrollment?.thirdLessonAt ?? null,
        adminName: s.admin?.fullName ?? "—",
      };
    }),
    leads: leads.map((l) => ({
      id: l.id,
      fullName: l.fullName,
      phone: l.phone,
      source: l.source,
      status: l.status,
      isQualified: l.isQualified,
      operatorId: l.operator?.id ?? "—",
      operatorName: l.operator?.fullName ?? "—",
      courseName: l.course?.name ?? "—",
      createdAt: l.createdAt,
      convertedAt: l.convertedAt,
    })),
    calls: calls.map((c) => ({
      id: c.id,
      operatorId: c.operator.id,
      operatorName: c.operator.fullName,
      leadName: c.lead?.fullName ?? c.phone,
      result: c.result as never,
      isLesson: c.isLesson,
      durationSeconds: c.durationSeconds,
      calledAt: c.calledAt,
    })),
    visits: visits.map((v) => ({
      id: v.id,
      leadName: v.lead.fullName,
      invitedById: v.invitedBy?.id ?? "—",
      invitedByName: v.invitedBy?.fullName ?? "—",
      scheduledAt: v.scheduledAt ?? v.createdAt,
      arrivedAt: v.arrivedAt,
      didArrive: v.didArrive,
      resultSale: v.resultSale,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      studentId: p.studentId ?? "—",
      studentName: p.student?.fullName ?? "—",
      amount: num(p.amount),
      method: p.method,
      isFirstPayment: p.isFirstPayment,
      receivedByName: p.receivedBy.fullName,
      paidAt: p.paidAt,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      amount: num(e.amount),
      category: e.category.name,
      title: e.title,
      method: e.method,
      authorName: e.createdBy.fullName,
      spentAt: e.spentAt,
    })),
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      courseName: g.course.name,
      teacherName: g.teacher?.fullName ?? "—",
      capacity: g.capacity,
      studentsCount: g._count.enrollments,
    })),
    audit: audit.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      actorName: a.actorName ?? "Система",
      actorRole: a.actorRole,
      action: a.action,
      entityLabel: a.entityLabel ?? a.entity,
      entity: a.entity,
      field: a.field,
      oldValue: a.oldValue,
      newValue: a.newValue,
      reason: a.reason,
    })),
    operators: operators.map((o) => ({ id: o.id, name: o.fullName })),
    staff,
  };
}
