import { headers } from "next/headers";
import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/** Клиент Prisma внутри транзакции или обычный (PrismaClient совместим). */
type Db = Prisma.TransactionClient;

export type FieldChange = { field: string; old: unknown; new: unknown };

export type AuditInput = {
  actor: SessionUser | null; // null = системная джоба
  action: AuditAction;
  entity: string; // "Lead" | "Student" | "Payment" ...
  entityId: string;
  entityLabel?: string;
  branchId?: string | null;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  changes?: FieldChange[];
  reason?: string;
  /** Клиент транзакции — чтобы лог откатился вместе с неудачной мутацией. */
  db?: Db;
};

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function requestMeta() {
  try {
    const h = await headers();
    return {
      ip:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    // вызов вне request-контекста (cron / seed)
    return { ip: null, userAgent: null };
  }
}

/**
 * Записать событие в журнал.
 * Единственный разрешённый способ писать в AuditLog — прямых create в коде быть не должно.
 */
export async function logAudit(input: AuditInput) {
  const db = input.db ?? prisma;
  const meta = await requestMeta();

  // Если передан массив изменений из одного поля — дублируем в плоские колонки,
  // чтобы отчёты вида «когда статус стал DEBTOR» работали по индексу.
  const single =
    input.field !== undefined
      ? { field: input.field, old: input.oldValue, new: input.newValue }
      : input.changes?.length === 1
        ? input.changes[0]
        : null;

  return db.auditLog.create({
    data: {
      branchId: input.branchId ?? null,
      actorId: input.actor?.id ?? null,
      actorRole: input.actor?.role ?? null,
      actorName: input.actor?.fullName ?? "Система",
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      entityLabel: input.entityLabel ?? null,
      field: single?.field ?? null,
      oldValue: str(single?.old),
      newValue: str(single?.new),
      changes: input.changes
        ? (input.changes.map((c) => ({
            field: c.field,
            old: str(c.old),
            new: str(c.new),
          })) as Prisma.InputJsonValue)
        : undefined,
      reason: input.reason ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}

/** Сравнить состояние «до» и «после» по списку отслеживаемых полей. */
export function diffEntity<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  trackedFields: (keyof T & string)[]
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of trackedFields) {
    if (!(field in after)) continue;
    const oldV = before[field];
    const newV = after[field];
    if (str(oldV) === str(newV)) continue;
    changes.push({ field, old: oldV, new: newV });
  }
  return changes;
}

/**
 * Обёртка для UPDATE: считает дифф и пишет лог, только если что-то реально изменилось.
 * Ничего не логирует при пустом диффе — журнал не засоряется.
 */
export async function logUpdate<T extends Record<string, unknown>>(params: {
  actor: SessionUser | null;
  entity: string;
  entityId: string;
  entityLabel?: string;
  branchId?: string | null;
  before: T;
  after: Partial<T>;
  trackedFields: (keyof T & string)[];
  reason?: string;
  db?: Db;
}) {
  const changes = diffEntity(params.before, params.after, params.trackedFields);
  if (changes.length === 0) return null;

  const isStatusChange = changes.length === 1 && changes[0].field === "status";

  return logAudit({
    actor: params.actor,
    action: isStatusChange ? "STATUS_CHANGE" : "UPDATE",
    entity: params.entity,
    entityId: params.entityId,
    entityLabel: params.entityLabel,
    branchId: params.branchId,
    changes,
    reason: params.reason,
    db: params.db,
  });
}

/** Поля, изменения которых обязаны попадать в журнал. */
export const TRACKED_FIELDS = {
  Lead: ["status", "isQualified", "operatorId", "branchId", "phone", "courseId"],
  Student: ["status", "branchId", "balance", "debtSince", "frozenTill", "adminId"],
  Enrollment: ["status", "groupId", "priceOverride", "discountPct"],
  Group: ["status", "teacherId", "monthlyPrice", "schedule", "roomId"],
  Invoice: ["status", "amount", "paidAmount", "dueDate"],
  Payment: ["amount", "method", "voidedAt"],
  Expense: ["amount", "categoryId", "approvedById", "voidedAt"],
  User: ["role", "branchId", "isActive", "phone"],
} as const;

/**
 * Готовые ответы на вопросы бизнеса — по ним строится вкладка «История».
 *   history("Student", id) → вся жизнь ученика;
 *   whoChangedStatusTo("Lead", "CONVERTED") → кто переводил лидов в студенты.
 */
export async function entityHistory(entity: string, entityId: string, take = 100) {
  return prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      actorName: true,
      actorRole: true,
      field: true,
      oldValue: true,
      newValue: true,
      changes: true,
      reason: true,
      createdAt: true,
    },
  });
}
