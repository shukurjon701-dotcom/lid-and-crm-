/**
 * Наполнение базы: один филиал, три администратора с полным доступом,
 * курсы, группы, ученики, счета, платежи, расходы и журнал изменений.
 *
 *   docker compose up -d db
 *   npm run db:push
 *   npm run db:seed
 *
 * Логины и пароли те же, что и в src/server/auth/accounts.ts,
 * поэтому вход не меняется при переключении на базу.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BRANCH = {
  id: "branch-main",
  name: "Asosiy filial",
  code: "MAIN",
  city: "Toshkent",
};

const ADMINS = [
  { id: "user-admin-1", login: "admin1", fullName: "Администратор 1", password: "admin1-2026" },
  { id: "user-admin-2", login: "admin2", fullName: "Администратор 2", password: "admin2-2026" },
  { id: "user-admin-3", login: "admin3", fullName: "Администратор 3", password: "admin3-2026" },
];

const OPERATORS = [
  { login: "nodira", fullName: "Nodira X." },
  { login: "sardor", fullName: "Sardor M." },
  { login: "kamola", fullName: "Kamola R." },
];

const TEACHERS = ["Ustoz Aliyev", "Ustoz Karimova", "Ustoz Yusupov", "Ustoz Saidova"];

const COURSES = [
  { name: "Ingliz tili", price: 450_000 },
  { name: "Matematika", price: 400_000 },
  { name: "Dasturlash", price: 700_000 },
  { name: "Koreys tili", price: 480_000 },
  { name: "Grafik dizayn", price: 600_000 },
];

const EXPENSE_CATEGORIES = ["Аренда", "Зарплата", "Реклама", "Хозрасходы", "Коммунальные"];

const FIRST = ["Aziz", "Malika", "Javohir", "Nilufar", "Sardor", "Dilnoza", "Bekzod", "Zilola", "Otabek", "Kamola", "Rustam", "Shahnoza"];
const LAST = ["Karimov", "Yusupova", "Abdullayev", "Rasulova", "To'xtayev", "Ergasheva", "Nazarov", "Sultonova"];

const rnd = (max: number) => Math.floor(Math.random() * max);
const pick = <T>(arr: readonly T[]): T => arr[rnd(arr.length)];
const int = (min: number, max: number) => min + rnd(max - min + 1);
const name = () => `${pick(FIRST)} ${pick(LAST)}`;
const phone = () => `+9989${rnd(10)}${String(rnd(10_000_000)).padStart(7, "0")}`;
const chance = (p: number) => Math.random() < p;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(int(9, 19), int(0, 59), 0, 0);
  return d;
};

async function main() {
  console.log("Очистка базы...");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.paymentAllocation.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.callLog.deleteMany(),
    prisma.visit.deleteMany(),
    prisma.student.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.group.deleteMany(),
    prisma.room.deleteMany(),
    prisma.course.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.expenseCategory.deleteMany(),
    prisma.branchMonthlyTarget.deleteMany(),
    prisma.workSession.deleteMany(),
    prisma.userBranchAccess.deleteMany(),
    prisma.user.deleteMany(),
    prisma.branch.deleteMany(),
  ]);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // Платежи и расходы раскидываем внутри текущего месяца: месячная аренда и
  // зарплаты относятся к нему целиком, иначе приход и расход считаются за разные
  // периоды и прибыль выходит неправдоподобной.
  const daysThisMonth = Math.max(
    0,
    Math.round((Date.now() - +monthStart) / 86_400_000)
  );

  console.log("Филиал...");
  const branch = await prisma.branch.create({
    data: { ...BRANCH, address: `${BRANCH.city}, ул. Учебная, 1`, phone: phone() },
  });

  console.log("Сотрудники...");
  const admins = [];
  for (const admin of ADMINS) {
    admins.push(
      await prisma.user.create({
        data: {
          id: admin.id,
          login: admin.login,
          fullName: admin.fullName,
          phone: phone(),
          passwordHash: await bcrypt.hash(admin.password, 10),
          role: "BRANCH_ADMIN",
          branchId: branch.id,
        },
      })
    );
  }

  const operators = [];
  for (const operator of OPERATORS) {
    operators.push(
      await prisma.user.create({
        data: {
          login: operator.login,
          fullName: operator.fullName,
          phone: phone(),
          passwordHash: await bcrypt.hash(`${operator.login}-2026`, 10),
          role: "OPERATOR",
          branchId: branch.id,
        },
      })
    );
  }

  const teachers = [];
  for (const [i, teacher] of TEACHERS.entries()) {
    teachers.push(
      await prisma.user.create({
        data: {
          login: `ustoz${i + 1}`,
          fullName: teacher,
          phone: phone(),
          passwordHash: await bcrypt.hash(`ustoz${i + 1}-2026`, 10),
          role: "TEACHER",
          branchId: branch.id,
        },
      })
    );
  }

  await prisma.branchMonthlyTarget.create({
    data: {
      branchId: branch.id,
      month: monthStart,
      revenueTarget: 200_000_000,
      studentsTarget: 30,
      leadsTarget: 250,
    },
  });

  console.log("Курсы, кабинеты, группы...");
  const categories = await Promise.all(
    EXPENSE_CATEGORIES.map((n) =>
      prisma.expenseCategory.create({ data: { branchId: branch.id, name: n } })
    )
  );

  const courses = await Promise.all(
    COURSES.map((c) =>
      prisma.course.create({
        data: {
          branchId: branch.id,
          name: c.name,
          monthlyPrice: c.price,
          lessonsPerWeek: 3,
        },
      })
    )
  );

  const rooms = await Promise.all(
    [1, 2, 3, 4].map((n) =>
      prisma.room.create({ data: { branchId: branch.id, name: `Xona ${n}`, capacity: 16 } })
    )
  );

  const groups = [];
  for (let g = 0; g < 14; g++) {
    const course = courses[g % courses.length];
    groups.push(
      await prisma.group.create({
        data: {
          branchId: branch.id,
          name: `${course.name.split(" ")[0]}-${String(g + 1).padStart(2, "0")}`,
          courseId: course.id,
          teacherId: teachers[g % teachers.length].id,
          roomId: rooms[g % rooms.length].id,
          status: "ACTIVE",
          startDate: daysAgo(60),
          capacity: 16,
          monthlyPrice: course.monthlyPrice,
          schedule: [
            { day: 1, start: "10:00", end: "11:30" },
            { day: 3, start: "10:00", end: "11:30" },
            { day: 5, start: "10:00", end: "11:30" },
          ] as Prisma.InputJsonValue,
        },
      })
    );
  }

  console.log("Лиды, визиты, звонки...");
  const SOURCES = ["INSTAGRAM", "TELEGRAM", "REFERRAL", "WALK_IN", "WEBSITE", "TIKTOK"] as const;
  const leads = [];
  for (let day = 0; day <= 30; day++) {
    for (let l = 0; l < int(5, 12); l++) {
      const operator = pick(operators);
      const createdAt = daysAgo(day);
      const converted = chance(0.14);
      const status = converted
        ? "CONVERTED"
        : pick(["NEW", "IN_PROGRESS", "NO_ANSWER", "VISIT_PLANNED", "VISITED", "REJECTED"] as const);

      const lead = await prisma.lead.create({
        data: {
          branchId: branch.id,
          fullName: name(),
          phone: phone(),
          source: pick(SOURCES),
          status,
          isQualified: chance(0.58),
          operatorId: operator.id,
          createdById: operator.id,
          courseId: pick(courses).id,
          createdAt,
          convertedAt: converted ? createdAt : null,
        },
      });
      leads.push({ lead, converted, createdAt, operator });

      await prisma.callLog.create({
        data: {
          branchId: branch.id,
          operatorId: operator.id,
          leadId: lead.id,
          phone: lead.phone,
          type: "OUTGOING",
          result: converted ? "APPOINTED" : pick(["ANSWERED", "NO_ANSWER", "CALLBACK_LATER"] as const),
          durationSeconds: int(20, 480),
          isLesson: chance(0.22),
          calledAt: createdAt,
        },
      });

      if (status === "VISITED" || status === "CONVERTED" || status === "VISIT_PLANNED") {
        await prisma.visit.create({
          data: {
            branchId: branch.id,
            leadId: lead.id,
            invitedById: operator.id,
            handledById: pick(admins).id,
            scheduledAt: createdAt,
            arrivedAt: status === "VISIT_PLANNED" ? null : createdAt,
            didArrive: status !== "VISIT_PLANNED",
            resultSale: status === "CONVERTED",
          },
        });
      }
    }
  }

  console.log("Ученики, счета, платежи...");
  let studentNo = 0;
  for (let i = 0; i < 260; i++) {
    const group = groups[i % groups.length];
    const course = courses.find((c) => c.id === group.courseId)!;
    const tenure = Math.floor(Math.pow(Math.random(), 1.15) * 400);
    const startedAt = daysAgo(tenure);

    const roll = Math.random();
    const status = roll < 0.88 ? "ACTIVE" : roll < 0.93 ? "FROZEN" : "LEFT";

    const cameSecond = tenure >= 2 && chance(0.82);
    const cameThird = cameSecond && tenure >= 4 && chance(0.85);
    const maxLessons = Math.max(1, Math.floor((tenure * 3) / 7));
    const lessons = !cameSecond ? 1 : !cameThird ? 2 : Math.max(3, Math.min(int(3, 60), maxLessons));

    const admin = pick(admins);
    const student = await prisma.student.create({
      data: {
        branchId: branch.id,
        publicId: `${BRANCH.code}-${String(++studentNo).padStart(5, "0")}`,
        fullName: name(),
        phone: phone(),
        source: pick(SOURCES),
        saleChannel: chance(0.62) ? "OFFLINE" : "ONLINE",
        adminId: admin.id,
        status,
        startedAt,
        frozenAt: status === "FROZEN" ? daysAgo(int(1, 40)) : null,
        leftAt: status === "LEFT" ? daysAgo(int(1, 90)) : null,
        leftReason:
          status === "LEFT" ? pick(["Переезд", "Финансы", "Не устроило расписание"]) : null,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        branchId: branch.id,
        studentId: student.id,
        groupId: group.id,
        status: status === "LEFT" ? "DROPPED" : status === "FROZEN" ? "FROZEN" : "ACTIVE",
        lessonsAttended: lessons,
        firstLessonAt: tenure > 0 ? startedAt : null,
        secondLessonAt: cameSecond ? daysAgo(Math.max(tenure - 2, 0)) : null,
        thirdLessonAt: cameThird ? daysAgo(Math.max(tenure - 4, 0)) : null,
        joinedAt: startedAt,
      },
    });

    if (status === "LEFT") continue;

    const amount = Number(course.monthlyPrice);
    const overdue = status === "ACTIVE" && chance(0.11);

    const invoice = await prisma.invoice.create({
      data: {
        branchId: branch.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        groupId: group.id,
        periodStart: monthStart,
        periodEnd: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0),
        dueDate: new Date(monthStart.getFullYear(), monthStart.getMonth(), 5),
        amount,
        paidAmount: overdue ? 0 : amount,
        status: overdue ? "OVERDUE" : "PAID",
        overdueSince: overdue ? daysAgo(int(1, 25)) : null,
        closedAt: overdue ? null : daysAgo(int(0, 20)),
      },
    });

    if (overdue) {
      await prisma.student.update({
        where: { id: student.id },
        data: { debtSince: invoice.overdueSince, balance: -amount },
      });
      await prisma.auditLog.create({
        data: {
          branchId: branch.id,
          actorName: "Система",
          action: "DEBT_OPENED",
          entity: "Student",
          entityId: student.id,
          entityLabel: `${student.fullName} (${student.publicId})`,
          field: "debtSince",
          newValue: invoice.overdueSince?.toISOString(),
          reason: "Счёт за текущий месяц не оплачен в срок",
          createdAt: invoice.overdueSince!,
        },
      });
    } else {
      const payment = await prisma.payment.create({
        data: {
          branchId: branch.id,
          studentId: student.id,
          amount,
          method: pick(["CASH", "CASH", "TERMINAL", "TERMINAL", "TERMINAL", "CARD", "TRANSFER"] as const),
          isFirstPayment: tenure < 30,
          receivedById: admin.id,
          paidAt: daysAgo(int(0, daysThisMonth)),
        },
      });
      await prisma.paymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: invoice.id, amount },
      });
    }

    if (status === "FROZEN") {
      await prisma.auditLog.create({
        data: {
          branchId: branch.id,
          actorId: admin.id,
          actorRole: "BRANCH_ADMIN",
          actorName: admin.fullName,
          action: "FREEZE",
          entity: "Student",
          entityId: student.id,
          entityLabel: `${student.fullName} (${student.publicId})`,
          field: "status",
          oldValue: "ACTIVE",
          newValue: "FROZEN",
          reason: "Заявление родителя",
          createdAt: daysAgo(int(1, 40)),
        },
      });
    }
  }

  console.log("Расходы...");
  const EXPENSE_PLAN = [
    { name: "Аренда", min: 18_000_000, max: 24_000_000, count: 1 },
    { name: "Зарплата", min: 4_000_000, max: 8_000_000, count: 5 },
    { name: "Реклама", min: 2_000_000, max: 5_000_000, count: 3 },
    { name: "Хозрасходы", min: 300_000, max: 2_500_000, count: 6 },
    { name: "Коммунальные", min: 1_200_000, max: 3_500_000, count: 2 },
  ];

  for (const plan of EXPENSE_PLAN) {
    const category = categories.find((c) => c.name === plan.name)!;
    for (let i = 0; i < plan.count; i++) {
      const author = pick(admins);
      const expense = await prisma.expense.create({
        data: {
          branchId: branch.id,
          categoryId: category.id,
          title: `${plan.name} — ${monthStart.toLocaleDateString("ru-RU", { month: "long" })}`,
          amount: int(plan.min, plan.max),
          method: chance(0.4) ? "CASH" : "TRANSFER",
          createdById: author.id,
          spentAt: daysAgo(int(0, daysThisMonth)),
        },
      });
      await prisma.auditLog.create({
        data: {
          branchId: branch.id,
          actorId: author.id,
          actorRole: "BRANCH_ADMIN",
          actorName: author.fullName,
          action: "EXPENSE_CREATE",
          entity: "Expense",
          entityId: expense.id,
          entityLabel: expense.title,
          newValue: String(expense.amount),
          createdAt: expense.spentAt,
        },
      });
    }
  }

  console.log("\nГотово.");
  console.log("Вход администраторов:");
  for (const admin of ADMINS) console.log(`  ${admin.login} / ${admin.password}`);
  console.log("Операторы: nodira / nodira-2026, sardor / sardor-2026, kamola / kamola-2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
