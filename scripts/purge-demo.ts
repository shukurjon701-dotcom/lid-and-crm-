/**
 * Удаление записей, оставшихся от прежнего демо-наполнения базы.
 *
 *   npm run db:purge-demo -- --dry-run   посмотреть, что будет удалено
 *   npm run db:purge-demo                выполнить
 *
 * Старый `prisma/seed.ts` заводил вымышленных операторов и преподавателей
 * с фиксированными логинами. Сам он больше ничего не сочиняет, но в базах,
 * которые он успел наполнить, эти учётки остались и попадают в отчёты как
 * настоящие сотрудники.
 *
 * Удаляются только эти логины — по точному списку, а не по догадке. Записи
 * из Bitrix и АТС не трогаются, даже если у них пустое имя: они настоящие.
 * Ссылки на удаляемых сначала переводятся на администратора, иначе база
 * не даст их убрать, а звонки и платежи просто исчезли бы вместе с ними.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

/** Логины из старого `prisma/seed.ts` — единственное, что здесь удаляется. */
const SEED_LOGINS = ["nodira", "sardor", "kamola", "ustoz1", "ustoz2", "ustoz3", "ustoz4"];

async function main() {
  const keeper = await prisma.user.findFirst({
    where: { role: { in: ["OWNER", "BRANCH_ADMIN"] } },
    select: { id: true, fullName: true },
  });
  if (!keeper) throw new Error("В базе нет администраторов — прерываю");

  const found = await prisma.user.findMany({
    where: { login: { in: SEED_LOGINS } },
    select: { id: true, login: true, fullName: true, role: true },
    orderBy: { login: "asc" },
  });

  if (found.length === 0) {
    console.log("\nДемо-учёток в базе нет — удалять нечего.\n");
    return;
  }

  console.log(`\nУдаление демо-учёток (${found.length}):`);
  for (const user of found) console.log(`   ${user.fullName} — ${user.login} (${user.role})`);
  console.log(`\nСсылки на них переходят к: ${keeper.fullName}`);

  if (DRY_RUN) {
    console.log("\n--dry-run: ничего не изменено.\n");
    return;
  }

  const ids = found.map((u) => u.id);
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

  console.log(`\nГотово. Удалено: ${found.length}. Осталось сотрудников: ${await prisma.user.count()}.\n`);
}

main()
  .catch((error) => {
    console.error("\nОшибка:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
