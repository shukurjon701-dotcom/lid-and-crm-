/**
 * Первичная настройка базы: филиал и три администратора — ровно то, без чего
 * невозможно войти в систему.
 *
 *   npm run db:push
 *   npm run db:seed
 *
 * Выдуманных учеников, лидов, звонков и платежей скрипт не создаёт и создавать
 * не должен: раньше он наполнял базу случайными записями, и на дашборде
 * появлялись деньги, которых не было. Ученики, лиды и платежи попадают в базу
 * только из настоящих источников — Sahab, Bitrix и АТС:
 *
 *   npm run import:sahab && npm run import:bitrix && npm run sync:pbx
 *
 * Скрипт ничего не удаляет и запускается повторно без последствий: существующие
 * записи обновляются, недостающие создаются.
 *
 * Логины и пароли те же, что и в src/server/auth/accounts.ts,
 * поэтому вход не меняется при переключении на базу.
 */
import { PrismaClient } from "@prisma/client";
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

/** Статьи расходов — справочник, а не данные: суммы вносит администратор. */
const EXPENSE_CATEGORIES = ["Аренда", "Зарплата", "Реклама", "Хозрасходы", "Коммунальные"];

async function main() {
  console.log("Филиал...");
  const branch = await prisma.branch.upsert({
    where: { id: BRANCH.id },
    update: { name: BRANCH.name, code: BRANCH.code, city: BRANCH.city },
    create: BRANCH,
  });

  console.log("Администраторы...");
  for (const admin of ADMINS) {
    await prisma.user.upsert({
      where: { login: admin.login },
      // Пароль не перезаписываем: сотрудник мог сменить его сам.
      update: { fullName: admin.fullName, role: "BRANCH_ADMIN", isActive: true },
      create: {
        id: admin.id,
        login: admin.login,
        fullName: admin.fullName,
        passwordHash: await bcrypt.hash(admin.password, 10),
        role: "BRANCH_ADMIN",
        branchId: branch.id,
      },
    });
  }

  console.log("Статьи расходов...");
  for (const name of EXPENSE_CATEGORIES) {
    const existing = await prisma.expenseCategory.findFirst({
      where: { name, branchId: branch.id },
    });
    if (!existing) await prisma.expenseCategory.create({ data: { name, branchId: branch.id } });
  }

  const students = await prisma.student.count();
  console.log(
    `\nГотово. Учеников в базе: ${students}.` +
      (students === 0
        ? "\nДанные подтягиваются из источников: npm run import:sahab, npm run import:bitrix, npm run sync:pbx\n"
        : "\n")
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
