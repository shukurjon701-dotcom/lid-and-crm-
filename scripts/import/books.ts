/**
 * Склад книг из отдельной таблицы.
 *
 *   npm run import:books -- --dry-run     # посмотреть, ничего не записывая
 *   npm run import:books                  # книги, остатки, закупки и продажи
 *
 * Книги больше не смешиваются с расходами центра: у учебника есть остаток,
 * закупочная и продажная цена — всё это живёт в моделях Book / BookMovement
 * и показывается в разделе «Книги». Прежние книжные записи в расходах и
 * платежах импорт удаляет.
 *
 * Таблица: BOOKS_SHEET_ID в .env. Листы:
 *   OMBOR          склад: остаток и цены     → Book
 *   BUYURTMA       закупка у поставщика      → BookMovement (PURCHASE)
 *   SOTUV          продажа ученикам          → BookMovement (SALE)
 *   KITOB MOLIYASI сводка по дням            — не переносим, считается сама
 */
import { PrismaClient } from "@prisma/client";
import { cell, readXlsx } from "./xlsx";
import { toDate, toNumber, toPaymentMethod } from "./csv";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");
const BRANCH_ID = "branch-main";
/** Статья расходов, в которую книги попадали раньше */
const LEGACY_CATEGORY = "Kitoblar (книги)";

type Purchase = { date: Date; title: string; count: number; unitCost: number; amount: number; method: string };
type Sale = { date: Date; buyer: string; title: string; count: number; unitPrice: number; amount: number; method: string };
type Stock = { title: string; opening: number; sold: number; left: number; unitCost: number; salePrice: number };

/** Ключ сопоставления названий между листами: регистр, апострофы и пробелы не важны. */
const key = (title: string) =>
  title.toLowerCase().replace(/[’'`ʼ]/g, "").replace(/\s+/g, " ").trim();

/** Строки-разделители («IYUL»), шапки и мусорные нули складом не являются. */
const isTitle = (value: string) =>
  value !== "" && value !== "0" && !/^kitob nomi$/i.test(value);

const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);
const money = (value: number) => value.toLocaleString("ru-RU");

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
    if (!date || !isTitle(title)) continue;

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
    if (!date || !isTitle(title)) continue;

    const count = toNumber(cell(row, "D")) || 1;
    const unitPrice = toNumber(cell(row, "E"));
    const amount = toNumber(cell(row, "F")) || count * unitPrice;
    if (amount <= 0) continue;

    sales.push({
      date,
      buyer: cell(row, "B"),
      title,
      count,
      unitPrice: unitPrice || amount / count,
      amount,
      method: cell(row, "G"),
    });
  }

  // --------------------------------------------------------------- склад
  // Колонки: A название, B начальный остаток, C заказано, D всего,
  // E продано, F остаток, G закупочная цена, H цена продажи.
  // Часть цен в таблице не заполнена — там стоит текст статуса, и toNumber
  // возвращает 0. Такие цены достраиваем из закупок и продаж.
  const stocks: Stock[] = [];
  for (const row of find("OMBOR")) {
    const title = cell(row, "A");
    if (!isTitle(title)) continue;
    stocks.push({
      title,
      opening: toNumber(cell(row, "B")),
      sold: toNumber(cell(row, "E")),
      left: toNumber(cell(row, "F")),
      unitCost: toNumber(cell(row, "G")),
      salePrice: toNumber(cell(row, "H")),
    });
  }

  // ------------------------------------------------------ сводка по книгам
  type Book = {
    title: string;
    unitCost: number;
    salePrice: number;
    stock: number;
    openingStock: number;
    purchasedCount: number;
    soldCount: number;
    purchasedAmount: number;
    soldAmount: number;
    lastPurchaseAt: Date | null;
    lastSaleAt: Date | null;
  };

  const books = new Map<string, Book>();
  const book = (title: string) => {
    const k = key(title);
    const existing = books.get(k);
    if (existing) return existing;
    const created: Book = {
      title: title.trim(),
      unitCost: 0,
      salePrice: 0,
      stock: 0,
      openingStock: 0,
      purchasedCount: 0,
      soldCount: 0,
      purchasedAmount: 0,
      soldAmount: 0,
      lastPurchaseAt: null,
      lastSaleAt: null,
    };
    books.set(k, created);
    return created;
  };

  // Склад — главный источник названий, остатков и цен
  for (const stock of stocks) {
    const item = book(stock.title);
    item.title = stock.title.trim();
    item.openingStock = stock.opening;
    item.stock = stock.left;
    item.unitCost = stock.unitCost;
    item.salePrice = stock.salePrice;
  }

  for (const purchase of purchases) {
    const item = book(purchase.title);
    item.purchasedCount += purchase.count;
    item.purchasedAmount += purchase.amount;
    if (!item.lastPurchaseAt || purchase.date > item.lastPurchaseAt) {
      item.lastPurchaseAt = purchase.date;
      if (purchase.unitCost > 0 && item.unitCost === 0) item.unitCost = purchase.unitCost;
    }
  }

  for (const sale of sales) {
    const item = book(sale.title);
    item.soldCount += sale.count;
    item.soldAmount += sale.amount;
    if (!item.lastSaleAt || sale.date > item.lastSaleAt) {
      item.lastSaleAt = sale.date;
      if (sale.unitPrice > 0 && item.salePrice === 0) item.salePrice = Math.round(sale.unitPrice);
    }
  }

  // Книга, которой нет на листе склада: остаток считаем по движениям
  const onStock = new Set(stocks.map((s) => key(s.title)));
  for (const [k, item] of books) {
    if (onStock.has(k)) continue;
    item.stock = Math.max(0, item.purchasedCount - item.soldCount);
  }

  const stockUnits = [...books.values()].reduce((a, b) => a + Math.max(b.stock, 0), 0);
  const stockValue = [...books.values()].reduce(
    (a, b) => a + Math.max(b.stock, 0) * b.unitCost,
    0
  );
  const profit = [...books.values()].reduce((a, b) => a + b.soldAmount - b.soldCount * b.unitCost, 0);

  console.log(`\nКниг в таблице: ${books.size}`);
  console.log(`Закупки: ${purchases.length} строк на ${money(sum(purchases))} сум`);
  console.log(`Продажи: ${sales.length} строк на ${money(sum(sales))} сум`);
  console.log(`На складе: ${money(stockUnits)} шт на ${money(stockValue)} сум`);
  console.log(`Заработок на книгах: ${money(Math.round(profit))} сум`);

  if (DRY_RUN) {
    console.log("\nСклад:");
    for (const item of [...books.values()].sort((a, b) => a.stock - b.stock).slice(0, 12)) {
      console.log(
        `   ${item.title.padEnd(28).slice(0, 28)} остаток ${String(item.stock).padStart(4)} шт  ` +
          `закупка ${money(item.unitCost).padStart(8)}  продажа ${money(item.salePrice).padStart(8)}  ` +
          `продано ${item.soldCount} шт`
      );
    }
    console.log("\n--dry-run: в базу ничего не записано.\n");
    return;
  }

  // ------------------------------------------------------------- запись
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: BRANCH_ID } });

  // Прежние книжные записи в финансах: теперь у книг свой раздел
  const legacy = await prisma.expenseCategory.findFirst({
    where: { branchId: branch.id, name: LEGACY_CATEGORY },
    select: { id: true },
  });
  let removedExpenses = 0;
  if (legacy) {
    removedExpenses = (
      await prisma.expense.deleteMany({ where: { branchId: branch.id, categoryId: legacy.id } })
    ).count;
    await prisma.expenseCategory.delete({ where: { id: legacy.id } });
  }
  const removedPayments = (
    await prisma.payment.deleteMany({
      where: { branchId: branch.id, comment: { startsWith: "Kitob sotuvi" } },
    })
  ).count;

  // Таблица — источник правды: перезаписываем склад целиком
  await prisma.bookMovement.deleteMany({ where: { branchId: branch.id } });
  await prisma.book.deleteMany({ where: { branchId: branch.id } });

  const ids = new Map<string, string>();
  for (const [k, item] of books) {
    const created = await prisma.book.create({
      data: {
        branchId: branch.id,
        title: item.title,
        unitCost: item.unitCost,
        salePrice: item.salePrice,
        stock: item.stock,
        openingStock: item.openingStock,
        purchasedCount: item.purchasedCount,
        soldCount: item.soldCount,
        purchasedAmount: item.purchasedAmount,
        soldAmount: item.soldAmount,
        lastPurchaseAt: item.lastPurchaseAt,
        lastSaleAt: item.lastSaleAt,
      },
      select: { id: true },
    });
    ids.set(k, created.id);
  }

  const movements = [
    ...purchases.map((p) => ({
      branchId: branch.id,
      bookId: ids.get(key(p.title))!,
      kind: "PURCHASE" as const,
      quantity: p.count,
      unitPrice: p.unitCost || (p.count ? p.amount / p.count : 0),
      amount: p.amount,
      method: toPaymentMethod(p.method),
      counterparty: null,
      happenedAt: p.date,
    })),
    ...sales.map((s) => ({
      branchId: branch.id,
      bookId: ids.get(key(s.title))!,
      kind: "SALE" as const,
      quantity: s.count,
      unitPrice: s.unitPrice,
      amount: s.amount,
      method: toPaymentMethod(s.method),
      counterparty: s.buyer || null,
      happenedAt: s.date,
    })),
  ];

  for (let i = 0; i < movements.length; i += 500) {
    await prisma.bookMovement.createMany({ data: movements.slice(i, i + 500) });
  }

  await prisma.auditLog.create({
    data: {
      branchId: branch.id,
      actorName: "Импорт таблицы книг",
      action: "CREATE",
      entity: "Book",
      entityId: branch.id,
      entityLabel: `Склад книг — ${books.size} наименований, ${money(stockUnits)} шт`,
      reason: "Загружено из таблицы книг",
    },
  });

  console.log(`\n─────────────── Загружено ───────────────`);
  console.log(`  Книг              ${books.size}`);
  console.log(`  Закупок           ${purchases.length} на ${money(sum(purchases))} сум`);
  console.log(`  Продаж            ${sales.length} на ${money(sum(sales))} сум`);
  if (removedExpenses || removedPayments) {
    console.log(
      `  Убрано из финансов: расходов ${removedExpenses}, платежей ${removedPayments}`
    );
  }
  console.log("\nОткройте http://localhost:3000/books\n");
}

main()
  .catch((e) => {
    console.error("\nОшибка:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
