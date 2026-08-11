import "server-only";
import type { Dataset, ExpenseRec, PaymentRec, StudentRec } from "@/server/data/types";
import type { PaymentMethod } from "@/types/domain";

/**
 * Все метрики дашбордов. Чистые функции над Dataset — не зависят от того,
 * пришли данные из Postgres или из демо-набора.
 */

// ------------------------------------------------------------------ периоды
const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export function periods(now = new Date()) {
  const todayFrom = startOfDay(now);
  const todayTo = addDays(todayFrom, 1);
  const yesterdayFrom = addDays(todayFrom, -1);
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { now, todayFrom, todayTo, yesterdayFrom, monthFrom, prevMonthFrom };
}

const inRange = (date: Date | null, from: Date, to: Date) =>
  date != null && +date >= +from && +date < +to;

const sumBy = <T>(rows: T[], get: (row: T) => number) =>
  rows.reduce((acc, row) => acc + get(row), 0);

const money = (rows: { amount: number }[]) => sumBy(rows, (r) => r.amount);

/** Процент изменения; null — если сравнивать не с чем. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export type MethodBreakdown = Record<PaymentMethod, number>;

function byMethod(rows: PaymentRec[]): MethodBreakdown {
  const acc: MethodBreakdown = { CASH: 0, CARD: 0, TERMINAL: 0, TRANSFER: 0 };
  for (const row of rows) acc[row.method] += row.amount;
  return acc;
}

export const debtOf = (student: StudentRec) => Math.max(0, -student.balance);
/**
 * Должник — это ученик с отметкой о начале долга. Сумма может быть неизвестна
 * (в таблице центра долг помечается цветом строки, без цифры), поэтому
 * отрицательный баланс здесь не обязателен.
 */
export const isDebtor = (student: StudentRec) =>
  student.status !== "LEFT" && student.debtSince != null;

// =============================================================== ШТАБ / ОБЗОР
export type ShtabMetrics = ReturnType<typeof shtabMetrics>;

export function shtabMetrics(ds: Dataset, now = new Date()) {
  const p = periods(now);

  const active = ds.students.filter((s) => s.status === "ACTIVE");
  const frozen = ds.students.filter((s) => s.status === "FROZEN");
  const leftThisMonth = ds.students.filter((s) => inRange(s.leftAt, p.monthFrom, p.todayTo));
  const debtors = ds.students.filter(isDebtor);

  const newThisMonth = ds.students.filter((s) => inRange(s.startedAt, p.monthFrom, p.todayTo));
  const leadsThisMonth = ds.leads.filter((l) => inRange(l.createdAt, p.monthFrom, p.todayTo));

  const paymentsMonth = ds.payments.filter((x) => inRange(x.paidAt, p.monthFrom, p.todayTo));
  const paymentsToday = ds.payments.filter((x) => inRange(x.paidAt, p.todayFrom, p.todayTo));
  const paymentsYesterday = ds.payments.filter((x) =>
    inRange(x.paidAt, p.yesterdayFrom, p.todayFrom)
  );
  const expensesMonth = ds.expenses.filter((x) => inRange(x.spentAt, p.monthFrom, p.todayTo));

  const revenueMonth = money(paymentsMonth);
  const expenseMonth = money(expensesMonth);

  // Выручка по дням — 14 точек для спарклайна
  const revenueByDay = Array.from({ length: 14 }, (_, i) => {
    const from = addDays(p.todayFrom, i - 13);
    const to = addDays(from, 1);
    return {
      date: from,
      value: money(ds.payments.filter((x) => inRange(x.paidAt, from, to))),
    };
  });

  // Распределение активных учеников по курсам
  const byCourse = groupCount(active, (s) => s.courseName);

  const groupsFilled = [...ds.groups]
    .filter((g) => g.studentsCount > 0)
    .sort((a, b) => b.studentsCount / b.capacity - a.studentsCount / a.capacity);

  return {
    activeStudents: active.length,
    frozenStudents: frozen.length,
    leftThisMonth: leftThisMonth.length,
    groupsCount: ds.groups.filter((g) => g.studentsCount > 0).length,

    newStudentsMonth: newThisMonth.length,
    leadsMonth: leadsThisMonth.length,
    conversion: leadsThisMonth.length
      ? (newThisMonth.length / leadsThisMonth.length) * 100
      : 0,

    revenueMonth,
    expenseMonth,
    netProfit: revenueMonth - expenseMonth,
    margin: revenueMonth ? ((revenueMonth - expenseMonth) / revenueMonth) * 100 : 0,

    revenueToday: money(paymentsToday),
    revenueTodayDelta: delta(money(paymentsToday), money(paymentsYesterday)),
    todayByMethod: byMethod(paymentsToday),

    debtorsCount: debtors.length,
    debtorsAmount: sumBy(debtors, debtOf),

    revenueByDay,
    byCourse,
    groupsFilled,
    audit: ds.audit.slice(0, 8),
  };
}

// ============================================================ АДМИНИСТРАТОР
export type AdminMetrics = ReturnType<typeof adminMetrics>;

export function adminMetrics(ds: Dataset, now = new Date()) {
  const p = periods(now);

  const newToday = ds.students.filter((s) => inRange(s.startedAt, p.todayFrom, p.todayTo));
  const newYesterday = ds.students.filter((s) =>
    inRange(s.startedAt, p.yesterdayFrom, p.todayFrom)
  );

  // Удержание считаем по когорте, у которой уже была возможность дойти до 3-го
  // урока: начали от 37 до 7 дней назад. Иначе вчерашние новички занижают процент.
  const cohortFrom = addDays(p.todayFrom, -60);
  const cohortTo = addDays(p.todayFrom, -3);
  // Только те, кто реально зачислен в группу: карточки из архива без группы
  // занятий не посещали и занижали бы воронку.
  const cohort = ds.students.filter(
    (s) => s.groupId !== "—" && inRange(s.startedAt, cohortFrom, cohortTo)
  );
  const reached2 = cohort.filter((s) => s.secondLessonAt != null || s.lessonsAttended >= 2);
  const reached3 = cohort.filter((s) => s.thirdLessonAt != null || s.lessonsAttended >= 3);

  const firstPaymentsToday = ds.payments.filter(
    (x) => x.isFirstPayment && inRange(x.paidAt, p.todayFrom, p.todayTo)
  );
  const paymentsToday = ds.payments.filter((x) => inRange(x.paidAt, p.todayFrom, p.todayTo));

  const frozen = ds.students.filter((s) => s.status === "FROZEN");
  const leftThisMonth = ds.students.filter((s) => inRange(s.leftAt, p.monthFrom, p.todayTo));

  const debtors = ds.students
    .filter(isDebtor)
    .map((s) => ({
      ...s,
      debt: debtOf(s),
      daysInDebt: Math.max(
        1,
        Math.round((+p.todayFrom - +s.debtSince!) / 86_400_000)
      ),
    }))
    .sort((a, b) => b.daysInDebt - a.daysInDebt);

  const visitsToday = ds.visits.filter((v) => inRange(v.scheduledAt, p.todayFrom, p.todayTo));

  return {
    newToday: newToday.length,
    newTodayDelta: delta(newToday.length, newYesterday.length),
    newTodayList: newToday.slice(0, 6),

    cohortSize: cohort.length,
    reached2: reached2.length,
    reached3: reached3.length,
    retention2: cohort.length ? (reached2.length / cohort.length) * 100 : 0,
    retention3: cohort.length ? (reached3.length / cohort.length) * 100 : 0,

    firstPaymentsCount: firstPaymentsToday.length,
    firstPaymentsAmount: money(firstPaymentsToday),
    paymentsTodayCount: paymentsToday.length,
    paymentsTodayAmount: money(paymentsToday),

    frozenCount: frozen.length,
    frozenList: frozen.slice(0, 5),
    leftCount: leftThisMonth.length,
    leftList: leftThisMonth.slice(0, 5),

    debtorsCount: debtors.length,
    debtorsAmount: sumBy(debtors, (d) => d.debt),
    debtors: debtors.slice(0, 10),

    visitsToday: visitsToday.length,
    visitsArrived: visitsToday.filter((v) => v.didArrive).length,

    audit: ds.audit.slice(0, 6),
  };
}

// ============================================================== CALL-ЦЕНТР
export type CallCenterMetrics = ReturnType<typeof callCenterMetrics>;

export function callCenterMetrics(ds: Dataset, now = new Date()) {
  const p = periods(now);

  const callsToday = ds.calls.filter((c) => inRange(c.calledAt, p.todayFrom, p.todayTo));
  const callsYesterday = ds.calls.filter((c) => inRange(c.calledAt, p.yesterdayFrom, p.todayFrom));
  const leadsToday = ds.leads.filter((l) => inRange(l.createdAt, p.todayFrom, p.todayTo));
  const visitsToday = ds.visits.filter((v) => inRange(v.scheduledAt, p.todayFrom, p.todayTo));
  const salesToday = ds.students.filter((s) => inRange(s.startedAt, p.todayFrom, p.todayTo));

  const perOperator = ds.operators
    .map((operator) => {
    const oCallsToday = callsToday.filter((c) => c.operatorId === operator.id);
    const oLeadsToday = leadsToday.filter((l) => l.operatorId === operator.id);
    const oVisits = visitsToday.filter((v) => v.invitedById === operator.id);
    return {
      id: operator.id,
      name: operator.name,
      callsToday: oCallsToday.length,
      lessonsToday: oCallsToday.filter((c) => c.isLesson).length,
      callsTotal: ds.calls.filter((c) => c.operatorId === operator.id).length,
      leadsToday: oLeadsToday.length,
      qualifiedToday: oLeadsToday.filter((l) => l.isQualified).length,
      visitsToday: oVisits.length,
      visitsArrived: oVisits.filter((v) => v.didArrive).length,
      talkMinutes: Math.round(
        sumBy(oCallsToday, (c) => c.durationSeconds) / 60
      ),
      };
    })
    // Показываем только тех, кто действительно звонит, и сортируем по нагрузке:
    // сотрудники без единого звонка в таблице рейтинга только мешают.
    .filter((o) => o.callsTotal > 0)
    .sort((a, b) => b.callsToday - a.callsToday || b.callsTotal - a.callsTotal);

  // 14 дней звонков — динамика нагрузки
  const callsByDay = Array.from({ length: 14 }, (_, i) => {
    const from = addDays(p.todayFrom, i - 13);
    const to = addDays(from, 1);
    return {
      date: from,
      value: ds.calls.filter((c) => inRange(c.calledAt, from, to)).length,
    };
  });

  return {
    callsToday: callsToday.length,
    callsTodayDelta: delta(callsToday.length, callsYesterday.length),
    callsTotal: ds.calls.length,
    lessonsToday: callsToday.filter((c) => c.isLesson).length,
    talkMinutesToday: Math.round(sumBy(callsToday, (c) => c.durationSeconds) / 60),

    leadsToday: leadsToday.length,
    qualifiedToday: leadsToday.filter((l) => l.isQualified).length,
    qualityRate: leadsToday.length
      ? (leadsToday.filter((l) => l.isQualified).length / leadsToday.length) * 100
      : 0,

    visitsToday: visitsToday.length,
    visitsArrived: visitsToday.filter((v) => v.didArrive).length,

    salesOffline: salesToday.filter((s) => s.saleChannel === "OFFLINE").length,
    salesOnline: salesToday.filter((s) => s.saleChannel === "ONLINE").length,

    perOperator,
    callsByDay,
    bySource: groupCount(
      ds.leads.filter((l) => inRange(l.createdAt, p.monthFrom, p.todayTo)),
      (l) => l.source
    ),
    recentLeads: [...leadsToday]
      .sort((a, b) => +b.createdAt - +a.createdAt)
      .slice(0, 8),
  };
}

// ================================================================= ФИНАНСЫ
export type MoliyaMetrics = ReturnType<typeof moliyaMetrics>;

export function moliyaMetrics(ds: Dataset, now = new Date()) {
  const p = periods(now);

  const paymentsToday = ds.payments.filter((x) => inRange(x.paidAt, p.todayFrom, p.todayTo));
  const paymentsYesterday = ds.payments.filter((x) =>
    inRange(x.paidAt, p.yesterdayFrom, p.todayFrom)
  );
  const paymentsMonth = ds.payments.filter((x) => inRange(x.paidAt, p.monthFrom, p.todayTo));
  const expensesToday = ds.expenses.filter((x) => inRange(x.spentAt, p.todayFrom, p.todayTo));
  const expensesMonth = ds.expenses.filter((x) => inRange(x.spentAt, p.monthFrom, p.todayTo));

  const revenueMonth = money(paymentsMonth);
  const expenseMonth = money(expensesMonth);

  const debtors = ds.students.filter(isDebtor);

  const expenseByCategory = Object.entries(
    expensesMonth.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {})
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const revenueByDay = Array.from({ length: 14 }, (_, i) => {
    const from = addDays(p.todayFrom, i - 13);
    const to = addDays(from, 1);
    return {
      date: from,
      value: money(ds.payments.filter((x) => inRange(x.paidAt, from, to))),
      expense: money(ds.expenses.filter((x) => inRange(x.spentAt, from, to))),
    };
  });

  return {
    revenueToday: money(paymentsToday),
    revenueTodayDelta: delta(money(paymentsToday), money(paymentsYesterday)),
    todayByMethod: byMethod(paymentsToday),
    paymentsTodayCount: paymentsToday.length,

    revenueMonth,
    expenseMonth,
    expenseToday: money(expensesToday),
    netProfit: revenueMonth - expenseMonth,
    margin: revenueMonth ? ((revenueMonth - expenseMonth) / revenueMonth) * 100 : 0,

    debtorsCount: debtors.length,
    debtorsAmount: sumBy(debtors, debtOf),

    expenseByCategory,
    revenueByDay,
    recentPayments: [...paymentsToday].sort((a, b) => +b.paidAt - +a.paidAt).slice(0, 8),
    recentExpenses: sortExpenses(expensesMonth).slice(0, 8),
  };
}

// ------------------------------------------------------------------ утилиты
function sortExpenses(rows: ExpenseRec[]) {
  return [...rows].sort((a, b) => +b.spentAt - +a.spentAt);
}

function groupCount<T>(rows: T[], key: (row: T) => string) {
  const acc = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    acc.set(k, (acc.get(k) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// =========================================================== ЛИЧНЫЙ КАБИНЕТ
export type PersonalMetrics = ReturnType<typeof personalMetrics>;

/**
 * Показатели одного сотрудника — то, что он видит про себя.
 *
 * Связь с данными двойная: звонки и лиды приходят с его идентификатором,
 * а группы и принятые оплаты — по имени, потому что в Sahab это текстовое поле.
 */
export function personalMetrics(
  ds: Dataset,
  user: { id: string; fullName: string; role: string },
  now = new Date()
) {
  const p = periods(now);
  const sameName = (value: string) =>
    value.trim().toLowerCase() === user.fullName.trim().toLowerCase();

  // ---- звонки
  const myCalls = ds.calls.filter((c) => c.operatorId === user.id);
  const callsToday = myCalls.filter((c) => inRange(c.calledAt, p.todayFrom, p.todayTo));
  const callsYesterday = myCalls.filter((c) =>
    inRange(c.calledAt, p.yesterdayFrom, p.todayFrom)
  );
  const callsMonth = myCalls.filter((c) => inRange(c.calledAt, p.monthFrom, p.todayTo));

  // ---- лиды и визиты
  const myLeads = ds.leads.filter((l) => l.operatorId === user.id);
  const leadsToday = myLeads.filter((l) => inRange(l.createdAt, p.todayFrom, p.todayTo));
  const leadsMonth = myLeads.filter((l) => inRange(l.createdAt, p.monthFrom, p.todayTo));
  const myVisits = ds.visits.filter((v) => v.invitedById === user.id);
  const visitsMonth = myVisits.filter((v) => inRange(v.scheduledAt, p.monthFrom, p.todayTo));

  // ---- преподавание
  const myGroups = ds.groups.filter((g) => sameName(g.teacherName));
  const myGroupIds = new Set(myGroups.map((g) => g.id));
  const myStudents = ds.students.filter(
    (s) => myGroupIds.has(s.groupId) && s.status !== "LEFT"
  );

  // ---- принятые оплаты
  const myPayments = ds.payments.filter((x) => sameName(x.receivedByName));
  const paymentsMonth = myPayments.filter((x) => inRange(x.paidAt, p.monthFrom, p.todayTo));
  const paymentsToday = myPayments.filter((x) => inRange(x.paidAt, p.todayFrom, p.todayTo));

  // ---- место в рейтинге операторов за сегодня
  const board = ds.operators
    .map((o) => ({
      id: o.id,
      name: o.name,
      calls: ds.calls.filter(
        (c) => c.operatorId === o.id && inRange(c.calledAt, p.todayFrom, p.todayTo)
      ).length,
    }))
    .filter((o) => o.calls > 0)
    .sort((a, b) => b.calls - a.calls);
  const place = board.findIndex((o) => o.id === user.id);

  return {
    hasCalls: myCalls.length > 0,
    hasGroups: myGroups.length > 0,
    hasPayments: myPayments.length > 0,

    callsToday: callsToday.length,
    callsTodayDelta: delta(callsToday.length, callsYesterday.length),
    callsMonth: callsMonth.length,
    callsTotal: myCalls.length,
    lessonsToday: callsToday.filter((c) => c.isLesson).length,
    talkMinutesToday: Math.round(sumBy(callsToday, (c) => c.durationSeconds) / 60),
    talkMinutesMonth: Math.round(sumBy(callsMonth, (c) => c.durationSeconds) / 60),

    leadsToday: leadsToday.length,
    leadsMonth: leadsMonth.length,
    qualifiedMonth: leadsMonth.filter((l) => l.isQualified).length,
    convertedMonth: leadsMonth.filter((l) => l.status === "CONVERTED").length,

    visitsMonth: visitsMonth.length,
    visitsArrived: visitsMonth.filter((v) => v.didArrive).length,

    groups: myGroups,
    studentsCount: myStudents.length,
    debtorsCount: myStudents.filter(isDebtor).length,

    paymentsTodayAmount: money(paymentsToday),
    paymentsMonthAmount: money(paymentsMonth),
    paymentsMonthCount: paymentsMonth.length,

    place: place >= 0 ? place + 1 : null,
    boardSize: board.length,
    recentCalls: [...callsToday].sort((a, b) => +b.calledAt - +a.calledAt).slice(0, 8),
    recentLeads: [...leadsMonth].sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 8),
  };
}
