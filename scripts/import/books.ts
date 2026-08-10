/**
 * Расходы на книги из отдельной таблицы.
 *
 *   npm run import:books -- --dry-run     # посмотреть, ничего не записывая
 *   npm run import:books                  # закупки книг → расходы
 *   npm run import:books -- --with-sales  # плюс продажи книг → приход
 *
 * Таблица: BOOKS_SHEET_ID в .env. Листы:
 *   BUYURTMA       закупка у поставщика  → расход
 *   SOTUV          продажа ученикам      → приход (только с --with-sales)
 *   OMBOR          остатки склада        — не переносим
 *   KITOB MOLIYASI сводка по дням        — не переносим
 */
import { PrismaClient } from "@prisma/client";
import { cell, readXlsx } from "./xlsx";
import { toDate, toNumber, toPaymentMethod } from "./csv";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const WITH_SALES = process.argv.includes("--with-sales");
const BRANCH_ID = "branch-main";
const CATEGORY = "Kitoblar (книги)";

type Purchase = { date: Date; title: string; count: number; unitCost: number; amount: number; method: string };
type Sale = { date: Date; buyer: string; title: string; count: number; amount: number; method: string };

async function main() {
  const id = process.env.BOOKS_SHEET_ID;
  if (!id) {
    console.error('\nНе задан BOOKS_SHEET_ID в .env.\n');
    process.exit(1);
  }

  console.log("\nСкачиваю таблицу книг...");
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
  if (!response.ok) {
    console.error(`\nGoogle вернул ${response.status}. Таблица должна быть открыта по ссылке.\n`);
    process.exit(1);
  }
  const sheets = readXlsx(Buffer.from(await response.arrayBuffer()));

  const find = (name: string) =>
    sheets.find((s) => s.name.trim().toUpperCase() === name)?.rows ?? [];

  // ------------------------------------------------------------- закупки
  const purchases: Purchase[] = [];
  for (const row of find("BUYURTMA")) {
    const date = toDate(cell(row, "A"));
    const title = cell(row, "B");
    // строки-разделители месяцев («IYUL») и шапка идут без даты
    if (!date || !title || title.toLowerCase() === "kitob nomi") continue;

    const count = toNumber(cell(row, "C"));
    const unitCost = toNumber(cell(row, "D"));
    const amount = toNumber(cell(row, "E")) || count * unitCost;
    if (amount <= 0) continue;

    purchases.push({ date, title, count, unitCost, amount, method: cell(row, "H") });
  }

  // ------------------------------------------------------------- продажи
  const sales: Sale[] = [];
  for (const row of find("SOTUV")) {
    const date = toDate(cell(row, "A"));
    const title = cell(row, "C");
    if (!date || !title || title.toLowerCase() === "kitob nomi") continue;

    const amount = toNumber(cell(row, "F")) || toNumber(cell(row, "E")) * toNumber(cell(row, "D"));
    if (amount <= 0) continue;

    sales.push({
      date,
      buyer: cell(row, "B"),
      title,
      count: toNumber(cell(row, "D")),
      amount,
      method: cell(row, "G"),
    });
  }

  const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);
  const period = (rows: { date: Date }[]) =>
    rows.length === 0
      ? "—"
      : `${new Date(Math.min(...rows.map((r) => +r.date))).toLocaleDateString("ru-RU")} — ` +
        `${new Date(Math.max(...rows.map((r) => +r.date))).toLocaleDateString("ru-RU")}`;

  console.log(`\nЗакупки книг: ${purchases.length} строк на ${sum(purchases).toLocaleString("ru-RU")} сум`);
  console.log(`   период: ${period(purchases)}`);
  console.log(`Продажи книг: ${sales.length} строк на ${sum(sales).toLocaleString("ru-RU")} сум`);
  console.log(`   период: ${period(sales)}`);
  console.log(
    `\nЗаработок на книгах: ${(sum(sales) - sum(purchases)).toLocaleString("ru-RU")} сум` +
      (WITH_SALES ? "" : "  (продажи не переносятся — добавьте --with-sales)")
  );

  if (DRY_RUN) {
    console.log("\nПервые закупки:");
    for (const p of purchases.slice(0, 5)) {
      console.log(
        `   ${p.date.toLocaleDateString("ru-RU")}  ${p.title.padEnd(26).slice(0, 26)} ` +
          `${p.count} шт × ${p.unitCost.toLocaleString("ru-RU")} = ${p.amount.toLocaleString("ru-RU")}`
      );
    }
    console.log("\n--dry-run: в базу ничего не записано.\n");
    return;
  }

  // ------------------------------------------------------------- запись
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: BRANCH_ID } });
  const admin = await prisma.user.findFirstOrThrow({
    where: { branchId: branch.id, role: "BRANCH_ADMIN" },
  });

  const category =
    (await prisma.expenseCategory.findFirst({ where: { branchId: branch.id, name: CATEGORY } })) ??
    (await prisma.expenseCategory.create({ data: { branchId: branch.id, name: CATEGORY } }));

  // Повторный запуск не должен задваивать: чистим прежние книжные записи
  await prisma.expense.deleteMany({ where: { branchId: branch.id, categoryId: category.id } });
  await prisma.payment.deleteMany({
    where: { branchId: branch.id, comment: { startsWith: "Kitob sotuvi" } },
  });

  for (const purchase of purchases) {
    await prisma.expense.create({
      data: {
        branchId: branch.id,
        categoryId: category.id,
        title: `Книги: ${purchase.title}${purchase.count ? ` — ${purchase.count} шт` : ""}`,
        amount: purchase.amount,
        method: toPaymentMethod(purchase.method),
        createdById: admin.id,
        spentAt: purchase.date,
        description: purchase.unitCost
          ? `Закупочная цена ${purchase.unitCost.toLocaleString("ru-RU")} сум за штуку`
          : null,
      },
    });
  }

  let salesWritten = 0;
  if (WITH_SALES) {
    for (const sale of sales) {
      await prisma.payment.create({
        data: {
          branchId: branch.id,
          amount: sale.amount,
          method: toPaymentMethod(sale.method),
          receivedById: admin.id,
          paidAt: sale.date,
          comment: `Kitob sotuvi: ${sale.title}${sale.buyer ? ` — ${sale.buyer}` : ""}`,
        },
      });
      salesWritten++;
    }
  }

  await prisma.auditLog.create({
    data: {
      branchId: branch.id,
      actorName: "Импорт из таблицы книг",
      action: "EXPENSE_CREATE",
      entity: "Expense",
      entityId: category.id,
      entityLabel: `Книги — ${purchases.length} закупок на ${sum(purchases).toLocaleString("ru-RU")} сум`,
      reason: "Перенесено из таблицы расходов на книги",
    },
  });

  console.log(`\n─────────────── Загружено ───────────────`);
  console.log(`  Расходы на книги  ${purchases.length} на ${sum(purchases).toLocaleString("ru-RU")} сум`);
  console.log(
    `  Продажи книг      ${salesWritten}` +
      (WITH_SALES ? ` на ${sum(sales).toLocaleString("ru-RU")} сум` : " (не переносились)")
  );
  console.log("\nОткройте http://localhost:3000/moliya\n");
}

main()
  .catch((e) => {
    console.error("\nОшибка:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
