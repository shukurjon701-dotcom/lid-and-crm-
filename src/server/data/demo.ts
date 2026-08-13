import "server-only";
import type {
  AuditRec,
  BookMoveRec,
  BookRec,
  CallRec,
  Dataset,
  ExpenseRec,
  GroupRec,
  LeadRec,
  PaymentRec,
  StudentRec,
  VisitRec,
} from "@/server/data/types";
import type { LeadSource, LeadStatus, PaymentMethod } from "@/types/domain";

/**
 * Детерминированный демо-набор: одно и то же число при каждом рендере в течение
 * дня (seed = дата), поэтому дашборд не «прыгает» между обновлениями страницы.
 * Удаляется вместе с подключением Postgres — метрики не меняются.
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aziz", "Malika", "Javohir", "Nilufar", "Sardor", "Dilnoza", "Bekzod", "Zilola",
  "Otabek", "Kamola", "Rustam", "Shahnoza", "Jasur", "Feruza", "Islom", "Sevara",
  "Doston", "Gulnora", "Akmal", "Madina", "Temur", "Nodira", "Ulugbek", "Charos",
];
const LAST = [
  "Karimov", "Yusupova", "Abdullayev", "Rasulova", "To'xtayev", "Ergasheva",
  "Nazarov", "Sultonova", "Qodirov", "Ibragimova", "Xolmatov", "Saidova",
];

const COURSES = [
  { name: "Ingliz tili", price: 450_000 },
  { name: "Matematika", price: 400_000 },
  { name: "Dasturlash", price: 700_000 },
  { name: "Koreys tili", price: 480_000 },
  { name: "Grafik dizayn", price: 600_000 },
];

const TEACHERS = ["Ustoz Aliyev", "Ustoz Karimova", "Ustoz Yusupov", "Ustoz Saidova"];
const OPERATORS = [
  { id: "op-1", name: "Nodira X." },
  { id: "op-2", name: "Sardor M." },
  { id: "op-3", name: "Kamola R." },
];
const ADMINS = ["Администратор 1", "Администратор 2", "Администратор 3"];

const SOURCES: LeadSource[] = [
  "INSTAGRAM", "INSTAGRAM", "INSTAGRAM", "TELEGRAM", "TELEGRAM",
  "REFERRAL", "REFERRAL", "WALK_IN", "WEBSITE", "TIKTOK",
];

/** Доля целевых лидов по источнику */
const SOURCE_QUALITY: Partial<Record<LeadSource, number>> = {
  REFERRAL: 0.82,
  WALK_IN: 0.8,
  WEBSITE: 0.64,
  TELEGRAM: 0.58,
  INSTAGRAM: 0.52,
  TIKTOK: 0.38,
};

const EXPENSE_CATEGORIES = [
  { name: "Аренда", min: 18_000_000, max: 24_000_000, count: 1 },
  { name: "Зарплата", min: 8_000_000, max: 16_000_000, count: 5 },
  { name: "Реклама", min: 2_000_000, max: 9_000_000, count: 4 },
  { name: "Хозрасходы", min: 300_000, max: 2_500_000, count: 6 },
  { name: "Коммунальные", min: 1_200_000, max: 3_500_000, count: 2 },
];

/** Учебники: закупочная цена и цена продажи ученику */
const BOOKS = [
  { title: "Amaliy", cost: 45_000, price: 90_000 },
  { title: "Nazariy", cost: 65_000, price: 90_000 },
  { title: "Qoida 1", cost: 45_000, price: 60_000 },
  { title: "Qoida 2", cost: 55_000, price: 70_000 },
  { title: "Mashq 1", cost: 30_000, price: 50_000 },
  { title: "Kids 1", cost: 30_000, price: 55_000 },
  { title: "Rangli arab tili", cost: 13_000, price: 30_000 },
  { title: "Kundalik", cost: 7_000, price: 15_000 },
  { title: "So'zlashuv", cost: 40_000, price: 70_000 },
];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export function buildDemoDataset(now = new Date()): Dataset {
  const today = startOfDay(now);
  const rand = mulberry32(
    today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  );

  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const chance = (p: number) => rand() < p;
  const name = () => `${pick(FIRST)} ${pick(LAST)}`;
  const phone = () => `+998 9${int(0, 9)} ${String(int(100, 999))}-${String(int(10, 99))}-${String(int(10, 99))}`;

  /** Дата n дней назад со случайным рабочим временем (для «сегодня» — не позже текущего часа) */
  const at = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    const maxHour = daysAgo === 0 ? Math.max(now.getHours(), 10) : 20;
    d.setHours(int(9, Math.min(maxHour, 20)), int(0, 59), 0, 0);
    return d;
  };

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysThisMonth = Math.max(1, Math.round((+today - +monthStart) / 86_400_000));

  // ---------------------------------------------------------------- группы
  const groups: GroupRec[] = [];
  for (let i = 0; i < 14; i++) {
    const course = COURSES[i % COURSES.length];
    groups.push({
      id: `grp-${i + 1}`,
      name: `${course.name.split(" ")[0]}-${String(i + 1).padStart(2, "0")}`,
      courseName: course.name,
      teacherName: TEACHERS[i % TEACHERS.length],
      capacity: 16,
      studentsCount: 0,
    });
  }

  // -------------------------------------------------------------- ученики
  const students: StudentRec[] = [];
  const audit: AuditRec[] = [];
  const payments: PaymentRec[] = [];

  const TOTAL_STUDENTS = 268;
  for (let i = 0; i < TOTAL_STUDENTS; i++) {
    const group = groups[i % groups.length];
    const course = COURSES.find((c) => c.name === group.courseName)!;
    // Стаж смещён к недавним: центр растёт, новых учеников больше, чем старых
    const daysAgo = Math.floor(Math.pow(rand(), 1.15) * 400);
    const startedAt = at(daysAgo);

    // 88% активны, 5% заморожены, 7% ушли
    const roll = rand();
    const status = roll < 0.88 ? "ACTIVE" : roll < 0.93 ? "FROZEN" : "LEFT";

    const isDebtor = status === "ACTIVE" && chance(0.11);
    const debtDaysAgo = isDebtor ? int(1, 25) : 0;

    // Воронка первых уроков: часть учеников отваливается после 1-го и 2-го занятия.
    // Уроки идут 3 раза в неделю, поэтому больше, чем прошло времени, посетить нельзя.
    const maxLessons = Math.max(1, Math.floor((daysAgo * 3) / 7));
    const cameSecond = daysAgo >= 2 && chance(0.82);
    const cameThird = cameSecond && daysAgo >= 4 && chance(0.85);

    const lessonsAttended = !cameSecond
      ? 1
      : !cameThird
        ? 2
        : status === "LEFT"
          ? Math.min(int(3, 8), maxLessons)
          : Math.max(3, Math.min(int(3, 60), maxLessons));
    const firstLessonAt = daysAgo > 0 ? startedAt : null;

    const student: StudentRec = {
      id: `st-${i + 1}`,
      publicId: `MAIN-${String(i + 1).padStart(5, "0")}`,
      fullName: name(),
      phone: phone(),
      courseName: group.courseName,
      groupId: group.id,
      groupName: group.name,
      status,
      source: pick(SOURCES),
      saleChannel: chance(0.62) ? "OFFLINE" : "ONLINE",
      startedAt,
      frozenAt: status === "FROZEN" ? at(int(1, 40)) : null,
      leftAt: status === "LEFT" ? at(int(1, 90)) : null,
      leftReason:
        status === "LEFT"
          ? pick(["Переезд", "Финансы", "Не устроило расписание", "Закончил курс"])
          : null,
      debtSince: isDebtor ? at(debtDaysAgo) : null,
      balance: isDebtor ? -course.price * int(1, 2) : 0,
      monthlyPrice: course.price,
      lessonsAttended,
      firstLessonAt,
      secondLessonAt: cameSecond ? at(Math.max(daysAgo - 2, 0)) : null,
      thirdLessonAt: cameThird ? at(Math.max(daysAgo - 4, 0)) : null,
      adminName: pick(ADMINS),
    };
    students.push(student);
    if (status === "ACTIVE") group.studentsCount++;

    if (isDebtor) {
      audit.push({
        id: `au-debt-${i}`,
        createdAt: student.debtSince!,
        actorName: "Система",
        actorRole: null,
        action: "DEBT_OPENED",
        entity: "Student",
        entityLabel: `${student.fullName} (${student.publicId})`,
        field: "debtSince",
        oldValue: null,
        newValue: student.debtSince!.toISOString(),
        reason: "Счёт за текущий месяц не оплачен в срок",
      });
    }

    // Платежи: активные и замороженные платят, ушедшие — нет
    if (status !== "LEFT") {
      const paymentsCount = isDebtor ? 0 : int(1, 2);
      for (let p = 0; p < paymentsCount; p++) {
        payments.push({
          id: `pay-${i}-${p}`,
          studentId: student.id,
          studentName: student.fullName,
          amount: course.price,
          method: pick<PaymentMethod>(["CASH", "CASH", "CARD", "CARD", "CARD", "CARD", "TRANSFER"]),
          isFirstPayment: daysAgo < daysThisMonth && p === 0,
          receivedByName: pick(ADMINS),
          paidAt: at(int(0, Math.min(daysThisMonth, 28))),
        });
      }
    }
  }

  // Сегодняшние оплаты — чтобы касса дня не была пустой
  for (let i = 0; i < 11; i++) {
    const student = students[int(0, students.length - 1)];
    payments.push({
      id: `pay-today-${i}`,
      studentId: student.id,
      studentName: student.fullName,
      amount: student.monthlyPrice,
      method: pick<PaymentMethod>(["CASH", "CASH", "CARD", "CARD", "CARD", "TRANSFER"]),
      isFirstPayment: i < 3,
      receivedByName: pick(ADMINS),
      paidAt: at(0),
    });
  }

  // ---------------------------------------------------------------- лиды
  const leads: LeadRec[] = [];
  const calls: CallRec[] = [];
  const visits: VisitRec[] = [];

  const LEAD_STATUSES: LeadStatus[] = [
    "NEW", "IN_PROGRESS", "IN_PROGRESS", "NO_ANSWER", "VISIT_PLANNED",
    "VISITED", "CONVERTED", "REJECTED",
  ];

  let leadNo = 0;
  for (let day = 0; day <= 30; day++) {
    const leadsToday = day === 0 ? int(4, 9) : int(5, 12);
    for (let l = 0; l < leadsToday; l++) {
      const operator = pick(OPERATORS);
      const createdAt = at(day);
      const status = day === 0 ? pick(["NEW", "IN_PROGRESS", "VISIT_PLANNED", "VISITED", "CONVERTED"] as LeadStatus[]) : pick(LEAD_STATUSES);
      const source = pick(SOURCES);
      const lead: LeadRec = {
        id: `ld-${++leadNo}`,
        fullName: name(),
        phone: phone(),
        source,
        status,
        // Качество лида зависит от источника: сарафан и «пришёл сам» целевые
        // почти всегда, реклама в TikTok — заметно реже.
        isQualified: chance(SOURCE_QUALITY[source] ?? 0.5),
        operatorId: operator.id,
        operatorName: operator.name,
        courseName: pick(COURSES).name,
        createdAt,
        convertedAt: status === "CONVERTED" ? createdAt : null,
      };
      leads.push(lead);

      if (status === "VISITED" || status === "CONVERTED" || status === "VISIT_PLANNED") {
        const arrived = status !== "VISIT_PLANNED";
        visits.push({
          id: `vs-${leadNo}`,
          leadName: lead.fullName,
          invitedById: operator.id,
          invitedByName: operator.name,
          scheduledAt: createdAt,
          arrivedAt: arrived ? createdAt : null,
          didArrive: arrived,
          resultSale: status === "CONVERTED",
        });
      }

      if (status === "CONVERTED") {
        audit.push({
          id: `au-conv-${leadNo}`,
          createdAt,
          actorName: pick(ADMINS),
          actorRole: "BRANCH_ADMIN",
          action: "CONVERT",
          entity: "Lead",
          entityLabel: lead.fullName,
          field: "status",
          oldValue: "VISITED",
          newValue: "CONVERTED",
          reason: null,
        });
      }
    }

    // звонки операторов за последние 14 дней
    if (day <= 14) {
      for (const operator of OPERATORS) {
        const callsToday = day === 0 ? int(24, 46) : int(38, 62);
        for (let c = 0; c < callsToday; c++) {
          calls.push({
            id: `cl-${day}-${operator.id}-${c}`,
            operatorId: operator.id,
            operatorName: operator.name,
            leadName: name(),
            result: pick(["ANSWERED", "ANSWERED", "NO_ANSWER", "CALLBACK_LATER", "APPOINTED", "REFUSED"]),
            isLesson: chance(0.22),
            durationSeconds: int(20, 480),
            calledAt: at(day),
          });
        }
      }
    }
  }

  // -------------------------------------------------------------- расходы
  const expenses: ExpenseRec[] = [];
  let expNo = 0;
  for (const category of EXPENSE_CATEGORIES) {
    for (let i = 0; i < category.count; i++) {
      expenses.push({
        id: `ex-${++expNo}`,
        amount: int(category.min, category.max),
        category: category.name,
        title:
          category.name === "Зарплата"
            ? `Зарплата — ${pick(TEACHERS)}`
            : `${category.name} — ${today.toLocaleDateString("ru-RU", { month: "long" })}`,
        method: chance(0.4) ? "CASH" : "TRANSFER",
        authorName: pick(ADMINS),
        spentAt: at(int(0, Math.min(daysThisMonth, 27))),
      });
    }
  }

  for (const expense of expenses.slice(0, 6)) {
    audit.push({
      id: `au-exp-${expense.id}`,
      createdAt: expense.spentAt,
      actorName: expense.authorName,
      actorRole: "BRANCH_ADMIN",
      action: "EXPENSE_CREATE",
      entity: "Expense",
      entityLabel: expense.title,
      field: null,
      oldValue: null,
      newValue: String(expense.amount),
      reason: null,
    });
  }

  // --------------------------------------------------------------- книги
  // Склад собирается из движений: сначала закупки и продажи, потом остаток.
  const books: BookRec[] = [];
  const bookMoves: BookMoveRec[] = [];
  let moveNo = 0;

  for (const [i, item] of BOOKS.entries()) {
    const openingStock = int(0, 12);
    const purchases = int(1, 2);
    let purchasedCount = 0;
    let purchasedAmount = 0;
    let lastPurchase = 0;

    for (let p = 0; p < purchases; p++) {
      const quantity = int(10, 40);
      const boughtAt = at(int(10, 70));
      purchasedCount += quantity;
      purchasedAmount += quantity * item.cost;
      lastPurchase = Math.max(lastPurchase, +boughtAt);
      bookMoves.push({
        id: `bm-${++moveNo}`,
        kind: "PURCHASE",
        bookTitle: item.title,
        counterparty: "Nashriyot",
        quantity,
        unitPrice: item.cost,
        amount: quantity * item.cost,
        method: chance(0.5) ? "CASH" : "TRANSFER",
        happenedAt: boughtAt,
      });
    }

    const salesCount = Math.min(int(0, 14), openingStock + purchasedCount);
    let soldCount = 0;
    let soldAmount = 0;
    let lastSale = 0;

    for (let s = 0; s < salesCount; s++) {
      const soldAt = at(int(0, 30));
      soldCount += 1;
      soldAmount += item.price;
      lastSale = Math.max(lastSale, +soldAt);
      bookMoves.push({
        id: `bm-${++moveNo}`,
        kind: "SALE",
        bookTitle: item.title,
        counterparty: name(),
        quantity: 1,
        unitPrice: item.price,
        amount: item.price,
        method: pick<PaymentMethod>(["CASH", "CASH", "CARD", "CARD", "TRANSFER"]),
        happenedAt: soldAt,
      });
    }

    books.push({
      id: `bk-${i + 1}`,
      title: item.title,
      unitCost: item.cost,
      salePrice: item.price,
      stock: openingStock + purchasedCount - soldCount,
      purchasedCount,
      soldCount,
      purchasedAmount,
      soldAmount,
      lastPurchaseAt: lastPurchase ? new Date(lastPurchase) : null,
      lastSaleAt: lastSale ? new Date(lastSale) : null,
    });
  }

  bookMoves.sort((a, b) => +b.happenedAt - +a.happenedAt);

  // заморозки и уходы в журнале
  for (const student of students.filter((s) => s.status === "FROZEN").slice(0, 5)) {
    audit.push({
      id: `au-frz-${student.id}`,
      createdAt: student.frozenAt!,
      actorName: student.adminName,
      actorRole: "BRANCH_ADMIN",
      action: "FREEZE",
      entity: "Student",
      entityLabel: `${student.fullName} (${student.publicId})`,
      field: "status",
      oldValue: "ACTIVE",
      newValue: "FROZEN",
      reason: "Заявление родителя",
    });
  }

  audit.sort((a, b) => +b.createdAt - +a.createdAt);

  return {
    isDemo: true,
    generatedAt: now,
    lastCallAt: calls[0]?.calledAt ?? null,
    students,
    leads,
    calls,
    visits,
    payments,
    expenses,
    books,
    bookMoves,
    groups,
    audit,
    operators: OPERATORS,
    staff: [...ADMINS.map((name, i) => ({
      id: `user-admin-${i + 1}`,
      fullName: name,
      login: `admin${i + 1}`,
      role: "BRANCH_ADMIN" as const,
      isActive: true,
      lastLogin: null,
      createdAt: at(200),
    })), ...OPERATORS.map((o) => ({
      id: o.id,
      fullName: o.name,
      login: o.id,
      role: "OPERATOR" as const,
      isActive: true,
      lastLogin: null,
      createdAt: at(200),
    }))],
  };
}
