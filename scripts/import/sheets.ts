/**
 * Импорт рабочей таблицы центра из Google Sheets прямо в базу.
 *
 *   npm run import:sheets -- --dry-run   # разобрать и показать, ничего не записывая
 *   npm run import:sheets                # записать в базу
 *   npm run import:sheets -- --replace   # сначала стереть прежних учеников/лидов/платежи
 *
 * Ссылка на таблицу берётся из .env (GOOGLE_SHEET_ID) или из аргумента:
 *   npm run import:sheets -- https://docs.google.com/spreadsheets/d/…/edit
 *
 * Таблица должна быть открыта по ссылке (доступ «Просматривать» или выше).
 */
import { PrismaClient } from "@prisma/client";
import { cell, normalizePhone, readXlsx, rowColor, type Sheet } from "./xlsx";
import { toDate, toNumber, toPaymentMethod } from "./csv";
import {
  detectLayout,
  emptyVocabulary,
  layoutFromHeader,
  learnVocabulary,
  looksLikeHeader,
  type Layout,
} from "./layout";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const REPLACE = process.argv.includes("--replace");
const BRANCH = { id: "branch-main", name: "Asosiy filial", code: "MAIN" };

// ------------------------------------------------------- расшифровка цветов
/** Лист «Ranglar» — легенда, по которой администраторы красят строки. */
const COLOR_STATUS = {
  FF00FF00: "PAID", // Yashil — to'lov qilgan
  FFFFFF00: "STUDYING_UNPAID", // Sariq — o'qiyapti, to'lov qilmagan
  FFFFFFFF: "TRIAL", // Oq — sinov darsga kelgan, kutilyapti
  none: "TRIAL", // строка не покрашена — ещё не размечена
  FFFF0000: "LOST", // Qizil — kelmadi / dars yoqmadi
  FFE06666: "LOST",
  FF3D85C6: "EVRO", // Ko'k — Evro guruh
  FF6FA8DC: "EVRO",
  FFFF00FF: "EXPECTED", // Siyohrang — kelishi kerak
} as const;

type Status = (typeof COLOR_STATUS)[keyof typeof COLOR_STATUS];

const STATUS_LABELS: Record<Status, string> = {
  PAID: "оплатил",
  STUDYING_UNPAID: "учится, не оплатил",
  TRIAL: "пробный / ждём",
  LOST: "не пришёл / ушёл",
  EVRO: "Evro guruh",
  EXPECTED: "должен прийти",
};

/** Эти статусы означают «уже ученик», остальные остаются лидами. */
const IS_STUDENT: Record<Status, boolean> = {
  PAID: true,
  STUDYING_UNPAID: true,
  EVRO: true,
  TRIAL: false,
  LOST: false,
  EXPECTED: false,
};

// ------------------------------------------------------------------ месяцы
const MONTHS: Record<string, number> = {
  yanvar: 0, fevral: 1, mart: 2, aprel: 3, may: 4, iyun: 5,
  iyul: 6, avgust: 7, sentabr: 8, oktabr: 9, nayabr: 10, noyabr: 10, dekabr: 11,
};

function sheetPeriod(name: string): Date | null {
  const clean = name.toLowerCase().replace(/[^a-zа-я]/gi, "");
  for (const [word, month] of Object.entries(MONTHS)) {
    if (clean.includes(word)) {
      const now = new Date();
      // Месяц позже текущего — значит это прошлый год
      const year = month > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      return new Date(year, month, 1);
    }
  }
  return null;
}

function sheetChannel(name: string): "ONLINE" | "OFFLINE" | null {
  const clean = name.toLowerCase().trim();
  if (clean.startsWith("online") || clean.startsWith("onn")) return "ONLINE";
  if (clean.startsWith("off")) return "OFFLINE";
  return null;
}

// ---------------------------------------------------------------- запись
type Record_ = {
  name: string;
  phone: string;
  group: string;
  teacher: string;
  seller: string;
  comment: string;
  status: Status;
  channel: "ONLINE" | "OFFLINE";
  period: Date;
  trialDate: Date | null;
  marks: string;
  amount: number;
  method: string;
  paidAt: Date | null;
  rawColor: string;
};

const isMonthWord = (name: string) =>
  Object.keys(MONTHS).some((m) => name.toLowerCase().trim() === m);

/** Найти строку заголовков в первых строках листа. */
function findHeaderRow(sheet: Sheet): number {
  for (let i = 0; i < Math.min(sheet.rows.length, 10); i++) {
    if (looksLikeHeader(sheet.rows[i])) return i;
  }
  return -1;
}

function parseSheet(
  sheet: Sheet,
  layout: Layout,
  headerIndex: number,
  unknownColors: Map<string, string>
): Record_[] {
  const channel = sheetChannel(sheet.name)!;
  const period = sheetPeriod(sheet.name)!;
  const out: Record_[] = [];

  const get = (row: Parameters<typeof cell>[0], letter: string | null) =>
    letter ? cell(row, letter) : "";

  for (let i = 0; i < sheet.rows.length; i++) {
    if (i <= headerIndex) continue;
    const row = sheet.rows[i];
    const name = get(row, layout.name);
    if (!name || name.length < 3 || isMonthWord(name) || looksLikeHeader(row)) continue;
    // сама шапка (в некоторых листах в ней затесался телефон, и она не отсеялась выше)
    if (/^(ism|f\.?i\.?o|familya|familiya|tel|guruh|ustoz)/i.test(name)) continue;
    if (!/\p{L}{3,}/u.test(name)) continue;

    const color = rowColor(row, [layout.name, layout.phone, layout.group ?? layout.name]);
    const mapped = (COLOR_STATUS as Record<string, Status>)[color];
    if (!mapped) unknownColors.set(color, name);

    out.push({
      name,
      phone: normalizePhone(get(row, layout.phone)),
      group: get(row, layout.group),
      teacher: get(row, layout.teacher),
      seller: get(row, layout.seller),
      comment: get(row, layout.comment),
      status: mapped ?? "TRIAL",
      channel,
      period,
      trialDate: toDate(get(row, layout.trial)) ?? toDate(get(row, layout.date)),
      marks: [get(row, layout.marks), get(row, layout.trial)].filter(Boolean).join(" "),
      amount: toNumber(get(row, layout.amount)),
      method: get(row, layout.method),
      paidAt: toDate(get(row, layout.date)),
      rawColor: color,
    });
  }

  return out;
}

// =================================================================== импорт
async function main() {
  const arg = process.argv.find((a) => a.startsWith("http") || /^[\w-]{30,}$/.test(a));
  const id =
    arg?.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ??
    (arg && !arg.startsWith("http") ? arg : null) ??
    process.env.GOOGLE_SHEET_ID;

  if (!id) {
    console.error(
      "\nНе указана таблица. Добавьте в .env строку GOOGLE_SHEET_ID=… " +
        "или передайте ссылку аргументом.\n"
    );
    process.exit(1);
  }

  console.log("\nСкачиваю таблицу...");
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
  );
  if (!response.ok) {
    console.error(
      `\nGoogle вернул ${response.status}. Проверьте, что таблица открыта по ссылке ` +
        `(Настройки доступа → «Всем, у кого есть ссылка»).\n`
    );
    process.exit(1);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const sheets = readXlsx(buffer);

  // ------------------------------------------------------------- разбор
  const unknownColors = new Map<string, string>();
  const records: Record_[] = [];
  const perSheet: string[] = [];
  const vocabulary = emptyVocabulary();

  // Пригодные к разбору листы: месяц + канал в названии
  const workSheets = sheets.filter((s) => sheetChannel(s.name) && sheetPeriod(s.name));

  // Проход 1: листы с заголовками — по ним набираем словарь имён
  const prepared = workSheets.map((sheet) => {
    const headerIndex = findHeaderRow(sheet);
    const hint = headerIndex >= 0 ? layoutFromHeader(sheet.rows[headerIndex]) : {};
    return { sheet, headerIndex, hint };
  });

  for (const { sheet, headerIndex, hint } of prepared) {
    if (headerIndex < 0) continue;
    const layout = detectLayout(sheet.rows.slice(headerIndex + 1), vocabulary, hint);
    if (layout) learnVocabulary(sheet.rows.slice(headerIndex + 1), layout, vocabulary);
  }

  // Проход 2: разбор всех листов — теперь словарь помогает найти продавца
  for (const { sheet, headerIndex, hint } of prepared) {
    const body = headerIndex >= 0 ? sheet.rows.slice(headerIndex + 1) : sheet.rows;
    const layout = detectLayout(body, vocabulary, hint);
    if (!layout) {
      perSheet.push(`  ${sheet.name.padEnd(18)} — структуру распознать не удалось`);
      continue;
    }
    const parsed = parseSheet(sheet, layout, headerIndex, unknownColors);
    const cols = `имя ${layout.name}, тел ${layout.phone}, группа ${layout.group ?? "—"}, ` +
      `ustoz ${layout.teacher ?? "—"}, продавец ${layout.seller ?? "—"}, ` +
      `сумма ${layout.amount ?? "—"}`;
    perSheet.push(`  ${sheet.name.padEnd(18)} ${String(parsed.length).padStart(4)} записей   (${cols})`);
    records.push(...parsed);
  }

  console.log(`\nЛисты (${sheets.length}):`);
  perSheet.forEach((line) => console.log(line));

  // Раньше по времени — раньше в обработке: последний месяц задаёт текущий статус
  records.sort((a, b) => +a.period - +b.period);

  // ------------------------------------------------- склейка людей по месяцам
  type Person = {
    name: string;
    phone: string;
    group: string;
    teacher: string;
    seller: string;
    comment: string;
    status: Status;
    channel: "ONLINE" | "OFFLINE";
    firstSeen: Date;
    lastSeen: Date;
    trialDate: Date | null;
    lessons: number;
    payments: { amount: number; method: string; paidAt: Date }[];
  };

  const people = new Map<string, Person>();
  const keyOf = (r: Record_) =>
    r.phone && r.phone.length > 8 ? r.phone : r.name.toLowerCase().replace(/\s+/g, " ");

  for (const r of records) {
    const key = keyOf(r);
    const existing = people.get(key);
    const lessons = /3\s*-?\s*dars/i.test(r.marks) ? 3 : /2\s*-?\s*dars/i.test(r.marks) ? 2 : 1;

    if (!existing) {
      people.set(key, {
        name: r.name,
        phone: r.phone,
        group: r.group,
        teacher: r.teacher,
        seller: r.seller,
        comment: r.comment,
        status: r.status,
        channel: r.channel,
        firstSeen: r.trialDate ?? r.paidAt ?? r.period,
        lastSeen: r.period,
        trialDate: r.trialDate,
        lessons,
        payments: r.amount > 0 ? [{ amount: r.amount, method: r.method, paidAt: r.paidAt ?? r.period }] : [],
      });
      continue;
    }

    // Более поздний месяц перекрывает статус и группу
    existing.status = r.status;
    existing.channel = r.channel;
    existing.lastSeen = r.period;
    existing.lessons = Math.max(existing.lessons, lessons);
    if (r.group) existing.group = r.group;
    if (r.teacher) existing.teacher = r.teacher;
    if (r.seller) existing.seller = r.seller;
    if (r.comment) existing.comment = r.comment;
    if (r.amount > 0) {
      existing.payments.push({ amount: r.amount, method: r.method, paidAt: r.paidAt ?? r.period });
    }
  }

  const all = [...people.values()];
  const students = all.filter((p) => IS_STUDENT[p.status]);
  const leads = all.filter((p) => !IS_STUDENT[p.status]);
  const payments = all.flatMap((p) => p.payments);

  // ------------------------------------------------------------- сводка
  const byStatus = new Map<Status, number>();
  for (const p of all) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);

  console.log(`\nВсего строк: ${records.length} → уникальных людей: ${all.length}`);
  console.log("По статусу (цвету строки):");
  for (const [status, n] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${STATUS_LABELS[status].padEnd(22)} ${n}`);
  }
  console.log(`\n  → учениками станут ${students.length}, лидами ${leads.length}`);
  console.log(
    `  → платежей с суммой: ${payments.length} на ${payments
      .reduce((a, p) => a + p.amount, 0)
      .toLocaleString("ru-RU")} сум`
  );

  const sellers = [...new Set(all.map((p) => p.seller).filter(Boolean))];
  const teachers = [...new Set(all.map((p) => p.teacher).filter(Boolean))];
  const groups = [...new Set(all.map((p) => p.group).filter(Boolean))];
  console.log(`\nГруппы (${groups.length}): ${groups.join(", ")}`);
  console.log(`Преподаватели (${teachers.length}): ${teachers.join(", ")}`);
  console.log(`Продавцы (${sellers.length}): ${sellers.join(", ")}`);

  if (unknownColors.size > 0) {
    console.log("\nЦвета, которых нет в легенде «Ranglar» — считаю их «пробный / ждём»:");
    for (const [color, example] of unknownColors) {
      console.log(`  #${color.slice(2)}  напр.: ${example}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: в базу ничего не записано.\n");
    return;
  }

  // ------------------------------------------------------------- запись
  const branch = await prisma.branch.upsert({
    where: { id: BRANCH.id },
    update: {},
    create: { ...BRANCH, city: "Toshkent" },
  });

  const users = await prisma.user.findMany({
    where: { branchId: branch.id },
    select: { id: true, fullName: true, role: true },
  });
  if (users.length === 0) {
    console.error("\nВ базе нет пользователей. Сначала: npm run db:seed\n");
    process.exit(1);
  }
  const fallback = users.find((u) => u.role === "BRANCH_ADMIN") ?? users[0];
  const byName = new Map(users.map((u) => [u.fullName.toLowerCase().trim(), u.id]));
  const userId = (name: string) => byName.get(name.toLowerCase().trim()) ?? fallback.id;

  if (REPLACE) {
    console.log("\n--replace: удаляю прежних учеников, лидов и платежи");
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
      // демо-группы и демо-расходы тоже убираем, иначе они смешаются с настоящими
      prisma.group.deleteMany(),
      prisma.course.deleteMany(),
      prisma.expense.deleteMany(),
      prisma.auditLog.deleteMany(),
    ]);
  }

  console.log("\nЗаписываю...");

  // курсы и группы
  const courseIds = new Map<string, string>();
  const groupIds = new Map<string, string>();

  const ensureGroup = async (rawName: string, teacher: string) => {
    const name = rawName.trim();
    if (!name) return null;
    if (groupIds.has(name)) return groupIds.get(name)!;

    const courseName = name.replace(/\s*(online|offline)\s*/gi, "").trim() || name;
    let courseId = courseIds.get(courseName);
    if (!courseId) {
      const course =
        (await prisma.course.findFirst({ where: { branchId: branch.id, name: courseName } })) ??
        (await prisma.course.create({
          data: { branchId: branch.id, name: courseName, monthlyPrice: 0 },
        }));
      courseId = course.id;
      courseIds.set(courseName, courseId);
    }

    const group =
      (await prisma.group.findFirst({ where: { branchId: branch.id, name } })) ??
      (await prisma.group.create({
        data: {
          branchId: branch.id,
          name,
          courseId,
          teacherId: teacher ? userId(teacher) : null,
          status: "ACTIVE",
          capacity: 16,
        },
      }));
    groupIds.set(name, group.id);
    return group.id;
  };

  let no = await prisma.student.count();
  let createdStudents = 0;
  let createdPayments = 0;
  let createdLeads = 0;

  for (const person of students) {
    const groupId = await ensureGroup(person.group, person.teacher);
    const student = await prisma.student.create({
      data: {
        branchId: branch.id,
        publicId: `${BRANCH.code}-${String(++no).padStart(5, "0")}`,
        fullName: person.name,
        phone: person.phone || "—",
        status: "ACTIVE",
        source: "OTHER",
        saleChannel: person.channel,
        adminId: userId(person.seller),
        startedAt: person.firstSeen,
      },
    });
    createdStudents++;

    if (groupId) {
      await prisma.enrollment.create({
        data: {
          branchId: branch.id,
          studentId: student.id,
          groupId,
          status: "ACTIVE",
          lessonsAttended: person.lessons,
          firstLessonAt: person.trialDate ?? person.firstSeen,
          secondLessonAt: person.lessons >= 2 ? person.firstSeen : null,
          thirdLessonAt: person.lessons >= 3 ? person.firstSeen : null,
          joinedAt: person.firstSeen,
        },
      });
    }

    for (const payment of person.payments) {
      await prisma.payment.create({
        data: {
          branchId: branch.id,
          studentId: student.id,
          amount: payment.amount,
          method: toPaymentMethod(payment.method),
          receivedById: userId(person.seller),
          paidAt: payment.paidAt,
          comment: "Перенесено из таблицы",
        },
      });
      createdPayments++;
    }

    // Жёлтый цвет = учится, но не оплатил → это должник
    if (person.status === "STUDYING_UNPAID") {
      await prisma.student.update({
        where: { id: student.id },
        data: { debtSince: person.lastSeen },
      });
      await prisma.auditLog.create({
        data: {
          branchId: branch.id,
          actorName: "Импорт из таблицы",
          action: "DEBT_OPENED",
          entity: "Student",
          entityId: student.id,
          entityLabel: `${person.name} (${student.publicId})`,
          field: "debtSince",
          newValue: person.lastSeen.toISOString(),
          reason: "В таблице строка отмечена жёлтым: o'qiyapti, lekin to'lov qilmagan",
          createdAt: person.lastSeen,
        },
      });
    }
  }

  for (const person of leads) {
    await prisma.lead.create({
      data: {
        branchId: branch.id,
        fullName: person.name,
        phone: person.phone || "—",
        source: "OTHER",
        status:
          person.status === "LOST"
            ? "REJECTED"
            : person.status === "EXPECTED"
              ? "VISIT_PLANNED"
              : "VISITED",
        isQualified: person.status !== "LOST",
        operatorId: userId(person.seller),
        comment: person.comment || null,
        createdAt: person.firstSeen,
      },
    });
    createdLeads++;
  }

  console.log("\n─────────────── Загружено ───────────────");
  console.log(`  Ученики   ${createdStudents}`);
  console.log(`  Лиды      ${createdLeads}`);
  console.log(`  Платежи   ${createdPayments}`);
  console.log(`  Группы    ${groupIds.size}   Курсы ${courseIds.size}`);
  console.log("\nОткройте http://localhost:3000/admin\n");
}

main()
  .catch((e) => {
    console.error("\nОшибка:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
