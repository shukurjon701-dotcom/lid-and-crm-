/**
 * Снятие входа с конкретных сотрудников — для тестовых учёток.
 *
 *   npm run users:drop -- aziz sevinchergashjonova mohinur --dry-run
 *   npm run users:drop -- aziz sevinchergashjonova mohinur
 *
 * Аргумент — логин или имя сотрудника (пробелы и апострофы не важны:
 * «sevinchergashjonova» найдёт «Sevinch Ergashjonova»).
 *
 * Сама запись сотрудника остаётся: за ней числятся звонки, лиды и оплаты,
 * а сотрудник пришёл из Bitrix или Sahab, а не из формы регистрации.
 * Убирается именно вход — логин и пароль. После этого человек заходит на
 * страницу регистрации и заводит себе доступ сам.
 *
 * Администраторов скрипт не трогает: остаться совсем без входа в систему
 * нельзя. Для полного удаления записи — флаг --delete (сработает, только
 * если за сотрудником ничего не числится).
 */
import { PrismaClient } from "@prisma/client";
import { bitrixStaff } from "./bitrix-staff";

const prisma = new PrismaClient();

const FLAGS = new Set(["--dry-run", "--delete"]);
const DRY_RUN = process.argv.includes("--dry-run");
const DELETE = process.argv.includes("--delete");
const targets = process.argv.slice(2).filter((a) => !FLAGS.has(a));

/** Ключ сравнения: регистр, пробелы, точки и апострофы не важны. */
const key = (value: string) => value.toLowerCase().replace(/[\s.'’`ʼ-]/g, "");

async function main() {
  if (targets.length === 0) {
    console.error("\nУкажите логины или имена: npm run users:drop -- aziz mohinur\n");
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      login: true,
      fullName: true,
      role: true,
      passwordHash: true,
      branchId: true,
    },
  });

  const found = new Map<string, (typeof users)[number]>();
  for (const target of targets) {
    const k = key(target);
    const matches = users.filter((u) => key(u.login) === k || key(u.fullName) === k);

    if (matches.length === 0) {
      console.log(`«${target}» — такого сотрудника нет, пропускаю`);
      continue;
    }
    for (const match of matches) found.set(match.id, match);
  }

  const admins = [...found.values()].filter((u) => u.role === "OWNER" || u.role === "BRANCH_ADMIN");
  for (const admin of admins) {
    console.log(`${admin.fullName} — администратор, вход не трогаю`);
    found.delete(admin.id);
  }

  // «!» вместо хеша — вход и так не заведён. Такую запись не трогаем совсем:
  // менять ей логин опасно, по нему синхронизация Bitrix узнаёт сотрудника.
  for (const user of [...found.values()]) {
    if (user.passwordHash !== "!") continue;
    console.log(`${user.fullName} [${user.login}] — входа и так нет, пропускаю`);
    found.delete(user.id);
  }

  if (found.size === 0) {
    console.log("\nНечего снимать.\n");
    return;
  }

  console.log(`\nСнимаю вход (${found.size}):`);
  for (const user of found.values()) {
    console.log(`   ${user.fullName} — вход «${user.login}»`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: ничего не изменено.\n");
    return;
  }

  // Логин `bitrix-<ID>` возвращаем, чтобы синхронизация узнала свою запись
  // и не завела человека вторым сотрудником.
  const fromBitrix = await bitrixStaff();

  for (const user of found.values()) {
    if (DELETE) {
      const [calls, leads, payments, students] = await Promise.all([
        prisma.callLog.count({ where: { operatorId: user.id } }),
        prisma.lead.count({ where: { operatorId: user.id } }),
        prisma.payment.count({ where: { receivedById: user.id } }),
        prisma.student.count({ where: { adminId: user.id } }),
      ]);
      const linked = calls + leads + payments + students;
      if (linked === 0) {
        await prisma.workSession.deleteMany({ where: { userId: user.id } });
        await prisma.userBranchAccess.deleteMany({ where: { userId: user.id } });
        await prisma.auditLog.updateMany({ where: { actorId: user.id }, data: { actorId: null } });
        await prisma.user.delete({ where: { id: user.id } });
        console.log(`   ${user.fullName} — запись удалена`);
        continue;
      }
      console.log(
        `   ${user.fullName} — за сотрудником числится ${linked} записей, ` +
          "удалять нельзя, снимаю только вход"
      );
    }

    const ids = fromBitrix.get(user.fullName.toLowerCase().trim()) ?? [];
    let login = `free-${user.id}`;
    for (const id of ids) {
      const candidate = `bitrix-${id}`;
      const taken = await prisma.user.findUnique({
        where: { login: candidate },
        select: { id: true },
      });
      if (!taken || taken.id === user.id) {
        login = candidate;
        break;
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { login, passwordHash: "!" },
    });

    await prisma.auditLog.create({
      data: {
        branchId: user.branchId,
        actorName: "Администратор",
        action: "PERMISSION_CHANGE",
        entity: "User",
        entityId: user.id,
        entityLabel: `${user.fullName} — вход снят`,
        reason: "Тестовый вход, сотрудник заведёт себе доступ сам",
      },
    });
  }

  console.log("\nГотово. Эти сотрудники теперь входят только после своей регистрации.\n");
}

main()
  .catch((e) => {
    console.error("\nОшибка:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
