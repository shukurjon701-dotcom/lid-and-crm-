/**
 * Сброс входов всем, кроме администраторов.
 *
 *   npm run users:reset -- --dry-run   посмотреть, что будет сделано
 *   npm run users:reset                выполнить
 *
 * Настоящим сотрудникам (тем, что пришли из Bitrix) вход сбрасывается —
 * они смогут зарегистрироваться заново сами. Демонстрационные записи,
 * оставшиеся от первичного наполнения базы, удаляются: ссылки на них
 * сначала переводятся на администратора, иначе база не даст их убрать.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

async function bitrixStaff(): Promise<Map<string, string>> {
  const webhook = process.env.BITRIX_WEBHOOK?.replace(/\/+$/, "");
  if (!webhook) return new Map();

  const byName = new Map<string, string>();
  let start = 0;
  for (;;) {
    const response = await fetch(`${webhook}/user.get.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start }),
    });
    const data = (await response.json()) as {
      result?: Record<string, unknown>[];
      next?: number;
    };
    for (const user of data.result ?? []) {
      const name = [user.NAME, user.LAST_NAME]
        .map((v) => String(v ?? "").trim())
        .filter((v) => v && !/^REG_ADMIN/i.test(v))
        .join(" ")
        .trim();
      if (name) byName.set(name.toLowerCase(), String(user.ID));
    }
    if (data.next === undefined) break;
    start = data.next;
  }
  return byName;
}

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["OWNER", "BRANCH_ADMIN"] } },
    select: { id: true, fullName: true },
  });
  if (admins.length === 0) throw new Error("В базе нет администраторов — прерываю");
  const keeper = admins[0];

  const others = await prisma.user.findMany({
    where: { role: { notIn: ["OWNER", "BRANCH_ADMIN"] } },
    select: { id: true, login: true, fullName: true, role: true, passwordHash: true },
    orderBy: { fullName: "asc" },
  });

  const fromBitrix = await bitrixStaff();

  const toReset: typeof others = [];
  const toDelete: typeof others = [];
  for (const user of others) {
    if (fromBitrix.has(user.fullName.toLowerCase().trim())) toReset.push(user);
    else toDelete.push(user);
  }

  console.log(`\nАдминистраторы остаются нетронутыми: ${admins.map((a) => a.fullName).join(", ")}\n`);
  console.log(`Сброс входа (${toReset.length}) — смогут зарегистрироваться заново:`);
  for (const u of toReset) {
    console.log(`   ${u.fullName}${u.passwordHash !== "!" ? `  (был вход «${u.login}»)` : "  (входа не было)"}`);
  }
  console.log(`\nУдаление демо-записей (${toDelete.length}):`);
  for (const u of toDelete) console.log(`   ${u.fullName} — ${u.login}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: ничего не изменено.\n");
    return;
  }

  // ---- сброс входа настоящим сотрудникам
  // В Bitrix встречаются две учётки на одно имя, поэтому логин может оказаться
  // занят — тогда добавляем номер, иначе база не даст записать.
  for (const user of toReset) {
    const base = `bitrix-${fromBitrix.get(user.fullName.toLowerCase().trim())}`;
    let login = base;
    for (let n = 2; n < 20; n++) {
      const taken = await prisma.user.findUnique({ where: { login }, select: { id: true } });
      if (!taken || taken.id === user.id) break;
      login = `${base}-${n}`;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { login, passwordHash: "!" },
    });
  }

  // ---- удаление демо-записей: сначала переводим ссылки на администратора
  const ids = toDelete.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.$transaction([
      prisma.group.updateMany({ where: { teacherId: { in: ids } }, data: { teacherId: keeper.id } }),
      prisma.student.updateMany({ where: { adminId: { in: ids } }, data: { adminId: keeper.id } }),
      prisma.lead.updateMany({ where: { operatorId: { in: ids } }, data: { operatorId: keeper.id } }),
      prisma.lead.updateMany({ where: { createdById: { in: ids } }, data: { createdById: keeper.id } }),
      prisma.callLog.updateMany({ where: { operatorId: { in: ids } }, data: { operatorId: keeper.id } }),
      prisma.visit.updateMany({ where: { invitedById: { in: ids } }, data: { invitedById: keeper.id } }),
      prisma.visit.updateMany({ where: { handledById: { in: ids } }, data: { handledById: keeper.id } }),
      prisma.payment.updateMany({ where: { receivedById: { in: ids } }, data: { receivedById: keeper.id } }),
      prisma.expense.updateMany({ where: { createdById: { in: ids } }, data: { createdById: keeper.id } }),
      prisma.attendance.updateMany({ where: { markedById: { in: ids } }, data: { markedById: keeper.id } }),
      prisma.auditLog.updateMany({ where: { actorId: { in: ids } }, data: { actorId: null } }),
      prisma.workSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.userBranchAccess.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
  }

  const left = await prisma.user.count();
  console.log(`\nГотово. Осталось записей сотрудников: ${left}.`);
  console.log("Входить могут только администраторы; остальные — через регистрацию.\n");
}

main()
  .catch((e) => {
    console.error("\nОшибка:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
