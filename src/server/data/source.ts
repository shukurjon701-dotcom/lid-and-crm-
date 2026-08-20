import "server-only";
import { APP } from "@/config/app";
import type { BookMoveRec, BookRec, Dataset } from "@/server/data/types";
import type { PaymentMethod, Role } from "@/types/domain";

/**
 * Источник данных — только Postgres.
 *
 * Подставного набора нет и быть не должно: выдуманные цифры на дашборде
 * неотличимы от настоящих, по ним принимают решения, и обнаруживается подмена
 * в лучшем случае через неделю. Поэтому если база недоступна или её схема
 * устарела, приложение показывает ошибку с причиной, а не «работающий» экран.
 *
 * Метрики (src/server/metrics) получают Dataset и не знают, откуда он.
 */

/** База недоступна. Ловится в src/app/error.tsx и объясняется человеку. */
export class DatabaseUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Нет данных из базы: ${reason}`);
    this.name = "DatabaseUnavailableError";
    this.reason = reason;
  }
}

const describe = (error: unknown, lines = 1) =>
  error instanceof Error ? error.message.split("\n").slice(0, lines).join(" ").trim() : String(error);

let dbProbe: { at: number; ready: boolean } | null = null;
const PROBE_TTL_MS = 15_000;

/**
 * Снимок базы живёт 20 секунд.
 *
 * Набор читается целиком на каждый переход между разделами — десять запросов
 * по всем таблицам филиала. Меняются данные только в момент синхронизации,
 * поэтому между кликами перечитывать их незачем: разделы открываются сразу,
 * а база получает один запрос вместо запроса на каждый клик каждого
 * сотрудника. После синхронизации снимок сбрасывается (`invalidateDataset`),
 * так что кнопка «Обновить» показывает свежие числа немедленно.
 */
const DATASET_TTL_MS = 20_000;
let dbCache: { at: number; data: Dataset } | null = null;
let loading: Promise<Dataset> | null = null;

/** Забыть снимок: вызывается после синхронизации с Bitrix, Sahab и АТС. */
export function invalidateDataset() {
  dbCache = null;
}

/** Ленивая загрузка Prisma: без сгенерированного клиента импорт бросает — это нормально. */
async function getPrisma() {
  const mod = await import("@/lib/prisma");
  return mod.prisma;
}

/**
 * Жива ли база. Нужна входу: пока БД не отвечает, пускаем по локальным
 * учётным записям. На данные дашборда это не влияет — их без базы нет.
 */
export async function isDatabaseReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    warnOnce("DATABASE_URL не задана");
    return false;
  }
  if (dbProbe && Date.now() - dbProbe.at < PROBE_TTL_MS) return dbProbe.ready;

  let ready = false;
  try {
    const prisma = await getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    ready = true;
  } catch (error) {
    // Причину пишем в лог — она видна в Render → Logs.
    warnOnce(`Не удалось подключиться к базе: ${describe(error)}`);
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
  if (!process.env.DATABASE_URL) {
    throw new DatabaseUnavailableError("переменная DATABASE_URL не задана");
  }

  if (dbCache && Date.now() - dbCache.at < DATASET_TTL_MS) return dbCache.data;

  try {
    // Пока снимок читается, соседние запросы ждут его же, а не отправляют
    // в базу ещё по десять запросов: страница и её layout грузятся разом,
    // да и сотрудников на дашбордах обычно несколько.
    loading ??= loadFromDatabase().finally(() => {
      loading = null;
    });
    const data = await loading;
    dbCache = { at: Date.now(), data };
    return data;
  } catch (error) {
    // Частая причина — на сервере не применена схема (`prisma db push`),
    // и запрос падает на колонке, которой ещё нет в базе.
    const reason = describe(error, 3);
    warnOnce(`Прочитать базу не удалось: ${reason}`);
    throw new DatabaseUnavailableError(reason);
  }
}

/**
 * Терминал в центре — это оплата картой через POS, отдельного способа нет.
 * В базе остались старые строки с `TERMINAL`, поэтому приводим их к `CARD`
 * на входе: дальше по приложению такого значения уже не встречается,
 * и касса по способам сходится с общей суммой.
 */
const toMethod = (method: string): PaymentMethod =>
  method === "TERMINAL" ? "CARD" : (method as PaymentMethod);

/**
 * Склад книг. Вынесено в отдельный запрос: если миграция с таблицами книг
 * ещё не применена, пустеет только раздел «Книги», а не весь дашборд.
 */
async function loadBooks(
  prisma: Awaited<ReturnType<typeof getPrisma>>
): Promise<{ books: BookRec[]; bookMoves: BookMoveRec[] }> {
  try {
    const [books, moves] = await Promise.all([
      prisma.book.findMany({ orderBy: { title: "asc" } }),
      prisma.bookMovement.findMany({
        include: { book: { select: { title: true } } },
        orderBy: { happenedAt: "desc" },
        take: 500,
      }),
    ]);

    return {
      books: books.map((b) => ({
        id: b.id,
        title: b.title,
        unitCost: Number(b.unitCost),
        salePrice: Number(b.salePrice),
        stock: b.stock,
        purchasedCount: b.purchasedCount,
        soldCount: b.soldCount,
        purchasedAmount: Number(b.purchasedAmount),
        soldAmount: Number(b.soldAmount),
        lastPurchaseAt: b.lastPurchaseAt,
        lastSaleAt: b.lastSaleAt,
      })),
      bookMoves: moves.map((m) => ({
        id: m.id,
        kind: m.kind,
        bookTitle: m.book.title,
        counterparty: m.counterparty,
        quantity: m.quantity,
        unitPrice: Number(m.unitPrice),
        amount: Number(m.amount),
        method: toMethod(m.method),
        happenedAt: m.happenedAt,
      })),
    };
  } catch {
    return { books: [], bookMoves: [] };
  }
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
        // Книги — отдельный раздел со складом, в расходах их не показываем
        where: { voidedAt: null, NOT: { category: { name: APP.booksExpenseCategory } } },
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

  const { books, bookMoves } = await loadBooks(prisma);

  return {
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
      method: toMethod(p.method),
      isFirstPayment: p.isFirstPayment,
      receivedByName: p.receivedBy.fullName,
      paidAt: p.paidAt,
    })),
    expenses: expenses.map((e) => ({
      id: e.id,
      amount: num(e.amount),
      category: e.category.name,
      title: e.title,
      method: toMethod(e.method),
      authorName: e.createdBy.fullName,
      spentAt: e.spentAt,
    })),
    books,
    bookMoves,
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
