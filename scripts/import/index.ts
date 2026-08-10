/**
 * Импорт данных из CSV в базу.
 *
 *   npm run db:import              — загрузить всё из data/import
 *   npm run db:import -- --dry-run — только показать, что будет загружено
 *   npm run db:import -- --replace — сначала удалить прежние данные центра
 *
 * Колонки распознаются по названию на русском, узбекском или английском —
 * список синонимов ниже, в COLUMNS. Лишние колонки игнорируются.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  field,
  parseCsv,
  toBool,
  toDate,
  toLeadSource,
  toLeadStatus,
  toNumber,
  toPaymentMethod,
  toSaleChannel,
  toStudentStatus,
} from "./csv";

const prisma = new PrismaClient();

const DIR = join(process.cwd(), "data", "import");
const DRY_RUN = process.argv.includes("--dry-run");
const REPLACE = process.argv.includes("--replace");

const BRANCH = { id: "branch-main", name: "Asosiy filial", code: "MAIN" };

// ---------------------------------------------------------------- синонимы
const COLUMNS = {
  fullName: ["ФИО", "Ф.И.О", "имя", "ученик", "ism", "ism familiya", "oquvchi", "o'quvchi", "name", "full name", "student"],
  phone: ["телефон", "тел", "номер", "telefon", "tel", "raqam", "phone", "нмр"],
  parentPhone: ["родитель", "телефон родителя", "ota-ona", "ota ona", "ota onasi telefoni", "parent"],
  group: ["группа", "guruh", "group"],
  course: ["курс", "направление", "kurs", "yonalish", "yo'nalish", "fan", "course"],
  teacher: ["преподаватель", "учитель", "ustoz", "o'qituvchi", "oqituvchi", "teacher"],
  capacity: ["вместимость", "мест", "sig'im", "sigim", "capacity", "joy"],
  price: ["цена", "стоимость", "сумма в месяц", "narx", "oylik", "oylik tolov", "oylik to'lov", "price", "monthly"],
  status: ["статус", "holat", "status", "holati"],
  startedAt: ["дата начала", "начало", "дата", "boshlagan sana", "boshlangan", "sana", "start", "date", "kelgan sana"],
  debt: ["долг", "задолженность", "qarz", "qarzdorlik", "qarzi", "debt"],
  debtSince: ["дата долга", "долг с", "qarz sanasi", "qarzdan beri", "debt since"],
  source: ["источник", "откуда", "manba", "qayerdan", "source"],
  saleChannel: ["канал", "kanal", "online offline", "sotuv turi", "channel"],
  admin: ["админ", "администратор", "ответственный", "mas'ul", "masul", "admin"],
  operator: ["оператор", "operator", "call markaz"],
  qualified: ["качественный", "целевой", "sifatli", "maqsadli", "qualified"],
  amount: ["сумма", "summa", "amount", "to'lov", "tolov", "pul", "оплата"],
  method: ["способ", "способ оплаты", "тип оплаты", "to'lov turi", "tolov turi", "usul", "method", "тип"],
  date: ["дата", "sana", "date", "kun", "дата оплаты", "to'lov sanasi"],
  receivedBy: ["принял", "кассир", "qabul qildi", "kim oldi", "received by", "кто принял"],
  isFirst: ["первый платеж", "первый платёж", "birinchi to'lov", "birinchi tolov", "first payment", "yangi mijoz"],
  category: ["статья", "категория", "kategoriya", "turi", "category", "rasxod turi"],
  title: ["название", "наименование", "nomi", "title", "izoh", "описание", "tavsif"],
  author: ["автор", "кто добавил", "kim qo'shdi", "kim qoshdi", "mas'ul", "author", "kimdan"],
  lessons: ["уроков", "посещено", "darslar", "dars soni", "lessons"],
  publicId: ["id", "код", "kod", "номер ученика", "raqami"],
  comment: ["комментарий", "izoh", "примечание", "comment", "note"],
};

// ------------------------------------------------------------------ утилиты
type Row = Record<string, string>;

function read(file: string): Row[] {
  const path = join(DIR, file);
  if (!existsSync(path)) return [];
  const rows = parseCsv(readFileSync(path, "utf8"));
  console.log(`  ${file}: ${rows.length} строк`);
  return rows;
}

const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const report = {
  groups: 0,
  courses: 0,
  students: 0,
  payments: 0,
  leads: 0,
  expenses: 0,
  skipped: [] as string[],
};

const skip = (what: string, why: string) => {
  if (report.skipped.length < 25) report.skipped.push(`${what} — ${why}`);
};

// ==================================================================== импорт
async function main() {
  console.log(`\nЧитаю CSV из ${DIR}\n`);

  const studentRows = read("students.csv");
  const groupRows = read("groups.csv");
  const paymentRows = read("payments.csv");
  const leadRows = read("leads.csv");
  const expenseRows = read("expenses.csv");

  const total = studentRows.length + groupRows.length + paymentRows.length + leadRows.length + expenseRows.length;
  if (total === 0) {
    console.log(`\nФайлов не найдено. Положите CSV в ${DIR} и запустите снова.`);
    console.log("Ожидаются: students.csv, groups.csv, payments.csv, leads.csv, expenses.csv (любые из них).\n");
    return;
  }

  if (DRY_RUN) {
    console.log("\n--- ПРОВЕРКА (--dry-run), в базу ничего не пишется ---");
    preview("Ученики", studentRows, (r) => `${field(r, COLUMNS.fullName)} · ${field(r, COLUMNS.group) || "без группы"} · долг ${toNumber(field(r, COLUMNS.debt))}`);
    preview("Платежи", paymentRows, (r) => `${field(r, COLUMNS.fullName)} · ${toNumber(field(r, COLUMNS.amount))} · ${toPaymentMethod(field(r, COLUMNS.method))}`);
    preview("Лиды", leadRows, (r) => `${field(r, COLUMNS.fullName)} · ${toLeadSource(field(r, COLUMNS.source))} · ${toLeadStatus(field(r, COLUMNS.status))}`);
    preview("Расходы", expenseRows, (r) => `${field(r, COLUMNS.category) || field(r, COLUMNS.title)} · ${toNumber(field(r, COLUMNS.amount))}`);
    return;
  }

  // ---------------------------------------------------------------- филиал
  const branch = await prisma.branch.upsert({
    where: { id: BRANCH.id },
    update: {},
    create: { ...BRANCH, city: "Toshkent" },
  });

  const admins = await prisma.user.findMany({
    where: { branchId: branch.id },
    select: { id: true, fullName: true, role: true },
  });
  if (admins.length === 0) {
    console.error("\nВ базе нет пользователей. Сначала выполните: npm run db:seed\n");
    process.exit(1);
  }
  const defaultUser = admins.find((u) => u.role === "BRANCH_ADMIN") ?? admins[0];
  const userByName = new Map(admins.map((u) => [key(u.fullName), u.id]));
  const findUser = (name: string) => userByName.get(key(name)) ?? defaultUser.id;

  if (REPLACE) {
    console.log("\n--replace: удаляю прежние данные центра (пользователи и филиал остаются)");
    await prisma.$transaction([
      prisma.paymentAllocation.deleteMany(),
      prisma.payment.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.attendance.deleteMany(),
      prisma.enrollment.deleteMany(),
      prisma.callLog.deleteMany(),
      prisma.visit.deleteMany(),
      prisma.student.deleteMany(),
      prisma.lead.deleteMany(),
      prisma.expense.deleteMany(),
      prisma.group.deleteMany(),
    ]);
  }

  console.log("\nЗагружаю...");

  // ------------------------------------------------------- курсы и группы
  const courseByName = new Map<string, string>();
  const ensureCourse = async (name: string, price: number) => {
    const clean = name.trim() || "Без курса";
    const cached = courseByName.get(key(clean));
    if (cached) return cached;

    const existing = await prisma.course.findFirst({
      where: { branchId: branch.id, name: clean },
    });
    if (existing) {
      courseByName.set(key(clean), existing.id);
      return existing.id;
    }
    const created = await prisma.course.create({
      data: { branchId: branch.id, name: clean, monthlyPrice: price || 0 },
    });
    report.courses++;
    courseByName.set(key(clean), created.id);
    return created.id;
  };

  const groupByName = new Map<string, string>();
  const ensureGroup = async (name: string, courseName: string, price: number, teacher = "", capacity = 16) => {
    const clean = name.trim();
    if (!clean) return null;
    const cached = groupByName.get(key(clean));
    if (cached) return cached;

    const existing = await prisma.group.findFirst({ where: { branchId: branch.id, name: clean } });
    if (existing) {
      groupByName.set(key(clean), existing.id);
      return existing.id;
    }
    const created = await prisma.group.create({
      data: {
        branchId: branch.id,
        name: clean,
        courseId: await ensureCourse(courseName || clean, price),
        teacherId: teacher ? findUser(teacher) : null,
        status: "ACTIVE",
        capacity: capacity || 16,
        monthlyPrice: price || null,
      },
    });
    report.groups++;
    groupByName.set(key(clean), created.id);
    return created.id;
  };

  for (const row of groupRows) {
    await ensureGroup(
      field(row, COLUMNS.group) || field(row, COLUMNS.title),
      field(row, COLUMNS.course),
      toNumber(field(row, COLUMNS.price)),
      field(row, COLUMNS.teacher),
      toNumber(field(row, COLUMNS.capacity))
    );
  }

  // ----------------------------------------------------------------- ученики
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const studentByName = new Map<string, { id: string; name: string }>();
  let no = await prisma.student.count();

  for (const row of studentRows) {
    const fullName = field(row, COLUMNS.fullName);
    if (!fullName) {
      skip("ученик", "пустая колонка с именем");
      continue;
    }

    const price = toNumber(field(row, COLUMNS.price));
    const groupId = await ensureGroup(
      field(row, COLUMNS.group),
      field(row, COLUMNS.course),
      price
    );
    const debt = toNumber(field(row, COLUMNS.debt));
    const status = toStudentStatus(field(row, COLUMNS.status));
    const startedAt = toDate(field(row, COLUMNS.startedAt)) ?? new Date();
    const debtSince = toDate(field(row, COLUMNS.debtSince)) ?? (debt > 0 ? startedAt : null);

    const student = await prisma.student.create({
      data: {
        branchId: branch.id,
        publicId: field(row, COLUMNS.publicId) || `${BRANCH.code}-${String(++no).padStart(5, "0")}`,
        fullName,
        phone: field(row, COLUMNS.phone) || "—",
        parentPhone: field(row, COLUMNS.parentPhone) || null,
        status,
        source: toLeadSource(field(row, COLUMNS.source)),
        saleChannel: toSaleChannel(field(row, COLUMNS.saleChannel)),
        adminId: findUser(field(row, COLUMNS.admin)),
        startedAt,
        frozenAt: status === "FROZEN" ? startedAt : null,
        leftAt: status === "LEFT" ? startedAt : null,
        balance: debt > 0 ? -debt : 0,
        debtSince: debt > 0 ? debtSince : null,
      },
    });
    report.students++;
    studentByName.set(key(fullName), { id: student.id, name: fullName });

    if (groupId) {
      const lessons = toNumber(field(row, COLUMNS.lessons));
      await prisma.enrollment.create({
        data: {
          branchId: branch.id,
          studentId: student.id,
          groupId,
          status: status === "LEFT" ? "DROPPED" : status === "FROZEN" ? "FROZEN" : "ACTIVE",
          lessonsAttended: lessons,
          firstLessonAt: lessons >= 1 ? startedAt : null,
          secondLessonAt: lessons >= 2 ? startedAt : null,
          thirdLessonAt: lessons >= 3 ? startedAt : null,
          joinedAt: startedAt,
        },
      });
    }

    // Долг превращаем в просроченный счёт — тогда он виден в «Должниках»
    // и сходится с кассой, а не остаётся отдельной цифрой.
    if (debt > 0) {
      const invoice = await prisma.invoice.create({
        data: {
          branchId: branch.id,
          studentId: student.id,
          periodStart: monthStart,
          periodEnd: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0),
          dueDate: new Date(monthStart.getFullYear(), monthStart.getMonth(), 5),
          amount: debt,
          paidAmount: 0,
          status: "OVERDUE",
          overdueSince: debtSince,
          comment: "Перенесено из таблицы при импорте",
        },
      });
      await prisma.auditLog.create({
        data: {
          branchId: branch.id,
          actorName: "Импорт из таблицы",
          action: "DEBT_OPENED",
          entity: "Student",
          entityId: student.id,
          entityLabel: `${fullName} (${student.publicId})`,
          field: "debtSince",
          newValue: invoice.overdueSince?.toISOString() ?? null,
          reason: "Долг перенесён из вашей таблицы",
        },
      });
    }
  }

  // ---------------------------------------------------------------- платежи
  for (const row of paymentRows) {
    const name = field(row, COLUMNS.fullName);
    const amount = toNumber(field(row, COLUMNS.amount));
    if (amount <= 0) {
      skip(`платёж ${name || "?"}`, "сумма не распознана");
      continue;
    }
    const student = studentByName.get(key(name));
    await prisma.payment.create({
      data: {
        branchId: branch.id,
        studentId: student?.id ?? null,
        amount,
        method: toPaymentMethod(field(row, COLUMNS.method)),
        isFirstPayment: toBool(field(row, COLUMNS.isFirst)),
        receivedById: findUser(field(row, COLUMNS.receivedBy)),
        paidAt: toDate(field(row, COLUMNS.date)) ?? new Date(),
        comment: field(row, COLUMNS.comment) || null,
      },
    });
    report.payments++;
    if (name && !student) skip(`платёж ${name}`, "ученик с таким именем не найден, платёж записан без привязки");
  }

  // ------------------------------------------------------------------ лиды
  for (const row of leadRows) {
    const fullName = field(row, COLUMNS.fullName);
    if (!fullName) {
      skip("лид", "пустая колонка с именем");
      continue;
    }
    const createdAt = toDate(field(row, COLUMNS.date)) ?? toDate(field(row, COLUMNS.startedAt)) ?? new Date();
    const status = toLeadStatus(field(row, COLUMNS.status));
    await prisma.lead.create({
      data: {
        branchId: branch.id,
        fullName,
        phone: field(row, COLUMNS.phone) || "—",
        source: toLeadSource(field(row, COLUMNS.source)),
        status,
        isQualified: toBool(field(row, COLUMNS.qualified)),
        operatorId: findUser(field(row, COLUMNS.operator)),
        comment: field(row, COLUMNS.comment) || null,
        createdAt,
        convertedAt: status === "CONVERTED" ? createdAt : null,
      },
    });
    report.leads++;
  }

  // --------------------------------------------------------------- расходы
  const categoryByName = new Map<string, string>();
  const ensureCategory = async (name: string) => {
    const clean = name.trim() || "Прочее";
    const cached = categoryByName.get(key(clean));
    if (cached) return cached;
    const existing = await prisma.expenseCategory.findFirst({
      where: { branchId: branch.id, name: clean },
    });
    const id =
      existing?.id ??
      (await prisma.expenseCategory.create({ data: { branchId: branch.id, name: clean } })).id;
    categoryByName.set(key(clean), id);
    return id;
  };

  for (const row of expenseRows) {
    const amount = toNumber(field(row, COLUMNS.amount));
    if (amount <= 0) {
      skip("расход", "сумма не распознана");
      continue;
    }
    const category = field(row, COLUMNS.category) || "Прочее";
    const authorId = findUser(field(row, COLUMNS.author));
    const expense = await prisma.expense.create({
      data: {
        branchId: branch.id,
        categoryId: await ensureCategory(category),
        title: field(row, COLUMNS.title) || category,
        amount,
        method: toPaymentMethod(field(row, COLUMNS.method)),
        createdById: authorId,
        spentAt: toDate(field(row, COLUMNS.date)) ?? new Date(),
        description: field(row, COLUMNS.comment) || null,
      },
    });
    report.expenses++;

    await prisma.auditLog.create({
      data: {
        branchId: branch.id,
        actorId: authorId,
        actorName: field(row, COLUMNS.author) || "Импорт из таблицы",
        action: "EXPENSE_CREATE",
        entity: "Expense",
        entityId: expense.id,
        entityLabel: expense.title,
        newValue: String(amount),
        reason: "Перенесено из вашей таблицы",
        createdAt: expense.spentAt,
      },
    });
  }

  // ------------------------------------------------------------------ итог
  console.log("\n─────────────── Загружено ───────────────");
  console.log(`  Ученики   ${report.students}`);
  console.log(`  Группы    ${report.groups}   Курсы ${report.courses}`);
  console.log(`  Платежи   ${report.payments}`);
  console.log(`  Лиды      ${report.leads}`);
  console.log(`  Расходы   ${report.expenses}`);

  if (report.skipped.length > 0) {
    console.log("\nНе загружено или требует внимания:");
    for (const line of report.skipped) console.log(`  · ${line}`);
  }
  console.log("\nОткройте http://localhost:3000/shtab — данные уже там.\n");
}

function preview(title: string, rows: Row[], line: (row: Row) => string) {
  if (rows.length === 0) return;
  console.log(`\n${title} (${rows.length}), первые 5:`);
  for (const row of rows.slice(0, 5)) console.log(`  · ${line(row)}`);
  console.log(`  колонки в файле: ${Object.keys(rows[0]).join(" | ")}`);
}

main()
  .catch((e) => {
    console.error("\nОшибка импорта:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
