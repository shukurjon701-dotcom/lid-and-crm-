/**
 * Перенос данных из Sahab в базу CRM.
 *
 * Разделение источников:
 *   Sahab          — ученики, группы, платежи, расходы, заморозки, посещаемость
 *   Google-таблица — лиды и пробные уроки (их в Sahab нет)
 *
 * Поэтому синхронизация переписывает учеников, группы и деньги,
 * но НЕ трогает лидов, загруженных из таблицы.
 */
import { PrismaClient } from "@prisma/client";
import { toPaymentMethod } from "./csv";

const prisma = new PrismaClient();
const API = "https://api.sahab.uz/api/v1";
const TENANT = process.env.SAHAB_DOMAIN || "arabicacademy.sahab.uz";
const BRANCH = { id: "branch-main", name: "Asosiy filial", code: "MAIN" };

const DRY_RUN = process.argv.includes("--dry-run");

const headers = { "Content-Type": "application/json", "x-tenant-domain": TENANT };

// ------------------------------------------------------------------- доступ
async function login() {
  const phone = process.env.SAHAB_PHONE;
  const password = process.env.SAHAB_PASSWORD;
  if (!phone || !password) throw new Error("Не заданы SAHAB_PHONE / SAHAB_PASSWORD в .env");

  const response = await fetch(`${API}/accounts/login/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone_number: phone, password }),
  });
  if (!response.ok) throw new Error(`Вход в Sahab не удался: ${response.status}`);

  const data = (await response.json()).data as {
    access: string;
    name?: string;
    profiles?: { type: string; id: string }[];
  };

  const auth = { ...headers, Authorization: `Bearer ${data.access}` };

  // Sahab требует выбрать профиль и филиал, иначе часть разделов закрыта
  const profile = data.profiles?.[0];
  if (profile) {
    await fetch(`${API}/accounts/set-profile-type/`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ profile_type: profile.type, profile_id: profile.id }),
    });
  }
  const branches = await fetchAll(auth, "/accounts/branches/");
  const first = branches[0] as { id?: string } | undefined;
  if (first?.id) {
    await fetch(`${API}/accounts/set-current-branch/`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ branch_id: first.id }),
    });
  }

  console.log(`Вход в Sahab: ${data.name ?? "—"}`);
  return auth;
}

/** Ответы Sahab бывают двух форм; достаём из обеих и идём по страницам. */
function extract(payload: unknown): { items: unknown[]; next: string | null; count: number } {
  const outer = payload as Record<string, unknown>;
  let body: Record<string, unknown> = outer;
  if (outer && typeof outer === "object" && "success" in outer && "data" in outer) {
    const inner = outer.data;
    if (Array.isArray(inner)) return { items: inner, next: null, count: inner.length };
    body = (inner ?? {}) as Record<string, unknown>;
  }

  let items: unknown[] = [];
  const results = body.results ?? outer.results;
  if (Array.isArray(results)) items = results;
  else if (results && typeof results === "object") {
    const nested = (results as Record<string, unknown>).data;
    if (Array.isArray(nested)) items = nested;
  } else if (Array.isArray(body.data)) items = body.data as unknown[];

  return {
    items,
    next: (body.next ?? outer.next ?? null) as string | null,
    count: Number(body.count ?? outer.count ?? items.length),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Запрос с повтором: Sahab иногда отвечает 502 при частых обращениях. */
async function request(url: string, auth: Record<string, string>): Promise<Response> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(url, { headers: auth });
    if (response.ok) return response;
    if (response.status < 500 && response.status !== 429) return response;
    if (attempt < 4) await sleep(attempt * 1500);
  }
  return fetch(url, { headers: auth });
}

async function fetchAll(auth: Record<string, string>, path: string): Promise<unknown[]> {
  const all: unknown[] = [];
  let url: string | null = `${API}${path}${path.includes("?") ? "&" : "?"}page_size=100`;

  while (url) {
    const response: Response = await request(url, auth);
    if (!response.ok) throw new Error(`${path} → ${response.status}`);
    const { items, next } = extract(await response.json());
    all.push(...items);
    url = next;
    if (url) await sleep(250); // не долбим их сервер
  }
  return all;
}

// ------------------------------------------------------------- типы Sahab
type SahabEnrollment = {
  group: string;
  group_name: string;
  course: { id: string; name: string; price: number } | null;
  teacher: { id: string; name: string } | null;
  enrolled_date: string | null;
  freeze_from: string | null;
  freeze_reason: string | null;
  left_date: string | null;
  left_reason: string | null;
  status: string;
  attendance_present: number;
  balance: number;
};

type SahabStudent = {
  id: string;
  full_name: string;
  phone_number: string | null;
  is_active: boolean;
  joined_date: string | null;
  balance: number;
  old_debt: number;
  groups_data: SahabEnrollment[];
};

type SahabGroup = {
  id: string;
  name: string;
  status: string;
  course_name: string;
  teacher_name: string | null;
  room_name: string | null;
  price: number;
  effective_capacity: number;
  active_students_count: number;
  start_date: string | null;
};

type SahabPayment = {
  id: string;
  student_name: string;
  amount: number;
  signed_amount: number;
  date: string;
  payment_method_name: string;
  kind: string;
  note: string | null;
};

type SahabExpense = {
  id: string;
  amount: number;
  date: string;
  category_name: string;
  recipient: string | null;
  payment_method_name: string;
  received_by_name: string | null;
  payout_kind: string | null;
  note: string | null;
};

const date = (value: string | null | undefined): Date | null =>
  value ? new Date(`${value}T12:00:00`) : null;

// =================================================================== перенос
async function main() {
  const auth = await login();

  console.log("Скачиваю данные...");
  // Последовательно, а не параллельно: параллельная выгрузка роняет их сервер в 502
  const groups = (await fetchAll(auth, "/management/groups/")) as SahabGroup[];
  const students = (await fetchAll(auth, "/management/students/")) as SahabStudent[];
  const payments = (await fetchAll(auth, "/finance/payments/")) as SahabPayment[];
  const expenses = (await fetchAll(auth, "/finance/expenses/")) as SahabExpense[];

  console.log(
    `  ученики ${students.length} · группы ${groups.length} · ` +
      `платежи ${payments.length} · расходы ${expenses.length}`
  );

  // ---------------------------------------------------------- разбор статусов
  //
  // Ученик считается активным, только если он занимается в действующей группе.
  // В Sahab 1251 карточка, но у 878 нет ни одной группы — это архив прошлых лет.
  // Их переносим со статусом «ушёл» и без даты ухода, чтобы они не искажали
  // метрику оттока, но и не терялись при поиске.
  const activeGroupIds = new Set(groups.map((g) => g.id));

  const summary = { active: 0, frozen: 0, left: 0, noGroup: 0, debtors: 0, debtSum: 0 };
  const prepared = students.map((student) => {
    const studying = student.groups_data.find(
      (g) => g.status === "studying" && !g.left_date && activeGroupIds.has(g.group)
    );
    const frozen = student.groups_data.find((g) => g.status === "frozen" && !g.left_date);
    const enrollment = studying ?? frozen ?? student.groups_data[0] ?? null;

    const status: "ACTIVE" | "FROZEN" | "LEFT" = studying
      ? "ACTIVE"
      : frozen
        ? "FROZEN"
        : "LEFT";

    const hasGroups = student.groups_data.length > 0;
    const balance = Number(student.balance ?? 0) - Number(student.old_debt ?? 0);

    if (status === "ACTIVE") summary.active++;
    else if (status === "FROZEN") summary.frozen++;
    else if (hasGroups) summary.left++;
    else summary.noGroup++;

    if (status !== "LEFT" && balance < 0) {
      summary.debtors++;
      summary.debtSum += -balance;
    }

    return { student, enrollment, status, balance, hasGroups };
  });

  console.log(
    `\nПо данным Sahab: активных ${summary.active}, замороженных ${summary.frozen}, ` +
      `ушедших ${summary.left}, без группы (архив) ${summary.noGroup}\n` +
      `Должников среди занимающихся: ${summary.debtors} ` +
      `на ${summary.debtSum.toLocaleString("ru-RU")} сум`
  );

  if (DRY_RUN) {
    const byStatus = new Map<string, number>();
    let noGroup = 0;
    for (const s of students) {
      if (s.groups_data.length === 0) noGroup++;
      for (const g of s.groups_data) byStatus.set(g.status, (byStatus.get(g.status) ?? 0) + 1);
    }
    console.log("\nПроверка:");
    console.log("  статусы записей в группу:", Object.fromEntries(byStatus));
    console.log("  учеников без групп:", noGroup);
    console.log(
      "  сумма active_students_count по группам:",
      groups.reduce((a, g) => a + (g.active_students_count ?? 0), 0)
    );
    const activeGroupIds = new Set(groups.map((g) => g.id));
    const inActiveGroup = students.filter((s) =>
      s.groups_data.some((g) => activeGroupIds.has(g.group) && g.status === "studying")
    ).length;
    console.log("  учеников в действующих группах:", inActiveGroup);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: в базу ничего не записано.\n");
    return;
  }

  // ------------------------------------------------------------- подготовка
  const branch = await prisma.branch.upsert({
    where: { id: BRANCH.id },
    update: {},
    create: { ...BRANCH, city: "Toshkent" },
  });

  const users = await prisma.user.findMany({
    where: { branchId: branch.id },
    select: { id: true, fullName: true, role: true },
  });
  if (users.length === 0) throw new Error("В базе нет пользователей — сначала npm run db:seed");
  const fallback = users.find((u) => u.role === "BRANCH_ADMIN") ?? users[0];
  const byName = new Map(users.map((u) => [u.fullName.toLowerCase().trim(), u.id]));
  const userId = (name?: string | null) =>
    (name && byName.get(name.toLowerCase().trim())) || fallback.id;

  // Лидов из Google-таблицы не трогаем: в Sahab их нет
  console.log("\nОчищаю прежние данные Sahab (лиды из таблицы остаются)...");
  await prisma.$transaction([
    prisma.paymentAllocation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.student.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.group.deleteMany(),
    prisma.course.deleteMany(),
  ]);

  console.log("Записываю...");

  // --------------------------------------------------------- курсы и группы
  const courseIds = new Map<string, string>();
  const ensureCourse = async (name: string, price: number) => {
    const clean = name.trim() || "Без курса";
    const cached = courseIds.get(clean);
    if (cached) return cached;
    const course = await prisma.course.create({
      data: { branchId: branch.id, name: clean, monthlyPrice: price || 0 },
    });
    courseIds.set(clean, course.id);
    return course.id;
  };

  const groupIds = new Map<string, string>();
  for (const group of groups) {
    const created = await prisma.group.create({
      data: {
        branchId: branch.id,
        name: group.name,
        courseId: await ensureCourse(group.course_name, group.price),
        teacherId: group.teacher_name ? userId(group.teacher_name) : null,
        status: group.status === "active" ? "ACTIVE" : "FINISHED",
        capacity: group.effective_capacity || 16,
        monthlyPrice: group.price || null,
        startDate: date(group.start_date),
      },
    });
    groupIds.set(group.id, created.id);
  }

  // ----------------------------------------------------------------- ученики
  const studentIds = new Map<string, string>();
  const studentByName = new Map<string, string>();
  let no = 0;

  for (const { student, enrollment, status, balance, hasGroups } of prepared) {
    const created = await prisma.student.create({
      data: {
        branchId: branch.id,
        publicId: `${BRANCH.code}-${String(++no).padStart(5, "0")}`,
        fullName: student.full_name,
        phone: student.phone_number || "—",
        status,
        source: "OTHER",
        saleChannel: "OFFLINE",
        adminId: fallback.id,
        startedAt: date(student.joined_date) ?? new Date(),
        frozenAt: date(enrollment?.freeze_from ?? null),
        leftAt: date(enrollment?.left_date ?? null),
        leftReason:
          enrollment?.left_reason ?? (hasGroups ? null : "Не зачислен ни в одну группу"),
        balance,
        // Долг ведёт сам Sahab; дату начала берём от прихода в группу
        debtSince:
          status !== "LEFT" && balance < 0
            ? (date(enrollment?.enrolled_date ?? student.joined_date) ?? new Date())
            : null,
      },
    });
    studentIds.set(student.id, created.id);
    studentByName.set(student.full_name.toLowerCase().trim(), created.id);

    const groupId = enrollment ? groupIds.get(enrollment.group) : null;
    if (enrollment && groupId) {
      const attended = enrollment.attendance_present ?? 0;
      const joined = date(enrollment.enrolled_date) ?? new Date();
      await prisma.enrollment.create({
        data: {
          branchId: branch.id,
          studentId: created.id,
          groupId,
          status: status === "LEFT" ? "DROPPED" : status === "FROZEN" ? "FROZEN" : "ACTIVE",
          lessonsAttended: attended,
          firstLessonAt: attended >= 1 ? joined : null,
          secondLessonAt: attended >= 2 ? joined : null,
          thirdLessonAt: attended >= 3 ? joined : null,
          joinedAt: joined,
        },
      });
    }

    if (status === "FROZEN" && enrollment?.freeze_from) {
      await prisma.auditLog.create({
        data: {
          branchId: branch.id,
          actorName: "Sahab",
          action: "FREEZE",
          entity: "Student",
          entityId: created.id,
          entityLabel: `${student.full_name} (${created.publicId})`,
          field: "status",
          oldValue: "ACTIVE",
          newValue: "FROZEN",
          reason: enrollment.freeze_reason ?? "Заморозка отмечена в Sahab",
          createdAt: date(enrollment.freeze_from)!,
        },
      });
    }
  }

  // ----------------------------------------------------------------- платежи
  let paid = 0;
  for (const payment of payments) {
    const amount = Number(payment.signed_amount ?? payment.amount);
    await prisma.payment.create({
      data: {
        branchId: branch.id,
        studentId: studentByName.get(payment.student_name?.toLowerCase().trim() ?? "") ?? null,
        amount: Math.abs(amount),
        direction: amount < 0 || payment.kind === "refund" ? "REFUND" : "INCOME",
        method: toPaymentMethod(payment.payment_method_name ?? ""),
        receivedById: fallback.id,
        paidAt: date(payment.date) ?? new Date(),
        comment: payment.note || null,
      },
    });
    paid++;
  }

  // ----------------------------------------------------------------- расходы
  const categoryIds = new Map<string, string>();
  const ensureCategory = async (name: string) => {
    const clean = name.trim() || "Прочее";
    const cached = categoryIds.get(clean);
    if (cached) return cached;
    const existing =
      (await prisma.expenseCategory.findFirst({ where: { branchId: branch.id, name: clean } })) ??
      (await prisma.expenseCategory.create({ data: { branchId: branch.id, name: clean } }));
    categoryIds.set(clean, existing.id);
    return existing.id;
  };

  let spent = 0;
  for (const expense of expenses) {
    const author = userId(expense.received_by_name);
    const created = await prisma.expense.create({
      data: {
        branchId: branch.id,
        categoryId: await ensureCategory(expense.category_name),
        title: expense.recipient
          ? `${expense.category_name} — ${expense.recipient}`
          : expense.category_name,
        amount: Number(expense.amount),
        method: toPaymentMethod(expense.payment_method_name ?? ""),
        createdById: author,
        spentAt: date(expense.date) ?? new Date(),
        description: expense.note || null,
      },
    });
    spent++;

    await prisma.auditLog.create({
      data: {
        branchId: branch.id,
        actorId: author,
        actorName: expense.received_by_name ?? "Sahab",
        action: "EXPENSE_CREATE",
        entity: "Expense",
        entityId: created.id,
        entityLabel: created.title,
        newValue: String(expense.amount),
        reason: "Перенесено из Sahab",
        createdAt: created.spentAt,
      },
    });
  }

  const leads = await prisma.lead.count();

  console.log("\n─────────────── Загружено ───────────────");
  console.log(`  Ученики   ${prepared.length}  (заморожено ${summary.frozen}, ушло ${summary.left})`);
  console.log(`  Должники  ${summary.debtors} на ${summary.debtSum.toLocaleString("ru-RU")} сум`);
  console.log(`  Группы    ${groups.length}   Курсы ${courseIds.size}`);
  console.log(`  Платежи   ${paid}`);
  console.log(`  Расходы   ${spent}`);
  console.log(`  Лиды      ${leads} — из Google-таблицы, не тронуты`);
  console.log("\nОткройте http://localhost:3000/shtab\n");
}

main()
  .catch((e) => {
    console.error("\nОшибка:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
