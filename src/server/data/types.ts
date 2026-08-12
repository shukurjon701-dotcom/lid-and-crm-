import type {
  AuditAction,
  LeadSource,
  LeadStatus,
  PaymentMethod,
  Role,
  SaleChannel,
  StudentStatus,
} from "@/types/domain";

/**
 * Плоский снимок данных филиала, из которого считаются все дашборды.
 * Источник — Postgres, а пока его нет — детерминированный демо-набор.
 * Метрики (src/server/metrics) написаны один раз и работают с обоими.
 */

export type StudentRec = {
  id: string;
  publicId: string;
  fullName: string;
  phone: string;
  courseName: string;
  groupId: string;
  groupName: string;
  status: StudentStatus;
  source: LeadSource;
  saleChannel: SaleChannel;
  startedAt: Date;
  frozenAt: Date | null;
  leftAt: Date | null;
  leftReason: string | null;
  /** Дата образования долга (первый непогашенный просроченный счёт) */
  debtSince: Date | null;
  /** Отрицательный баланс = долг */
  balance: number;
  monthlyPrice: number;
  lessonsAttended: number;
  firstLessonAt: Date | null;
  secondLessonAt: Date | null;
  thirdLessonAt: Date | null;
  adminName: string;
};

export type LeadRec = {
  id: string;
  fullName: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  isQualified: boolean;
  operatorId: string;
  operatorName: string;
  courseName: string;
  createdAt: Date;
  convertedAt: Date | null;
};

export type CallRec = {
  id: string;
  operatorId: string;
  operatorName: string;
  leadName: string;
  result: "ANSWERED" | "NO_ANSWER" | "BUSY" | "CALLBACK_LATER" | "REFUSED" | "APPOINTED";
  isLesson: boolean;
  durationSeconds: number;
  calledAt: Date;
};

export type VisitRec = {
  id: string;
  leadName: string;
  invitedById: string;
  invitedByName: string;
  scheduledAt: Date;
  arrivedAt: Date | null;
  didArrive: boolean;
  resultSale: boolean;
};

export type PaymentRec = {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  method: PaymentMethod;
  isFirstPayment: boolean;
  receivedByName: string;
  paidAt: Date;
};

export type ExpenseRec = {
  id: string;
  amount: number;
  category: string;
  title: string;
  method: PaymentMethod;
  authorName: string;
  spentAt: Date;
};

/** Учебник на складе: цена, остаток и итоги по закупкам и продажам. */
export type BookRec = {
  id: string;
  title: string;
  /** Закупочная цена за штуку */
  unitCost: number;
  /** Цена продажи ученику */
  salePrice: number;
  /** Остаток на складе, штук */
  stock: number;
  purchasedCount: number;
  soldCount: number;
  /** Потрачено на закупку, сум */
  purchasedAmount: number;
  /** Выручка от продаж, сум */
  soldAmount: number;
  lastPurchaseAt: Date | null;
  lastSaleAt: Date | null;
};

/** Движение книг: закупка у поставщика или продажа ученику. */
export type BookMoveRec = {
  id: string;
  kind: "PURCHASE" | "SALE";
  bookTitle: string;
  /** Покупатель или поставщик */
  counterparty: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  method: PaymentMethod;
  happenedAt: Date;
};

export type GroupRec = {
  id: string;
  name: string;
  courseName: string;
  teacherName: string;
  capacity: number;
  studentsCount: number;
};

export type AuditRec = {
  id: string;
  createdAt: Date;
  actorName: string;
  actorRole: Role | null;
  action: AuditAction;
  entity: string;
  entityLabel: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
};

export type OperatorRec = { id: string; name: string };

export type StaffRec = {
  id: string;
  fullName: string;
  login: string;
  role: Role;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
};

export type Dataset = {
  /** true — данные демонстрационные, БД ещё не подключена */
  isDemo: boolean;
  generatedAt: Date;
  /** Время самого свежего звонка — по нему видно, когда обновлялись данные */
  lastCallAt: Date | null;
  students: StudentRec[];
  leads: LeadRec[];
  calls: CallRec[];
  visits: VisitRec[];
  payments: PaymentRec[];
  expenses: ExpenseRec[];
  books: BookRec[];
  bookMoves: BookMoveRec[];
  groups: GroupRec[];
  audit: AuditRec[];
  operators: OperatorRec[];
  staff: StaffRec[];
};
