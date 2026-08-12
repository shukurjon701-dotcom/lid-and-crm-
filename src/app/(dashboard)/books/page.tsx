import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { BookRec } from "@/server/data/types";
import { METHOD_LABELS } from "@/types/domain";

export const dynamic = "force-dynamic";

/** Меньше этого числа на складе — пора докупать (как «Kam qoldi» в таблице). */
const LOW_STOCK = 6;

const FILTERS = [
  { value: "low", label: "Заканчиваются" },
  { value: "out", label: "Нет в наличии" },
  { value: "in", label: "Есть на складе" },
];

/** Заработок на книге: продажи минус закупочная стоимость проданного. */
const profitOf = (book: BookRec) => book.soldAmount - book.soldCount * book.unitCost;

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "books.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = [...ds.books];
  if (params.filter === "low") rows = rows.filter((b) => b.stock > 0 && b.stock < LOW_STOCK);
  else if (params.filter === "out") rows = rows.filter((b) => b.stock <= 0);
  else if (params.filter === "in") rows = rows.filter((b) => b.stock >= LOW_STOCK);
  rows = search(rows, params.q, (b) => [b.title]);

  // Сначала то, что заканчивается: этот список нужен, чтобы вовремя заказать
  rows.sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title));

  const page = paginate(rows, pageNumber(params.page));

  const stockUnits = ds.books.reduce((a, b) => a + Math.max(b.stock, 0), 0);
  const stockValue = ds.books.reduce((a, b) => a + Math.max(b.stock, 0) * b.unitCost, 0);
  const profit = ds.books.reduce((a, b) => a + profitOf(b), 0);
  const lowCount = ds.books.filter((b) => b.stock < LOW_STOCK).length;

  const sales = ds.bookMoves.filter((m) => m.kind === "SALE").slice(0, 8);
  const purchases = ds.bookMoves.filter((m) => m.kind === "PURCHASE").slice(0, 8);

  const columns: Column<BookRec>[] = [
    {
      header: "Книга",
      hint: "Kitob nomi",
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.title}</p>
          <p className="truncate text-[11px] text-ink-3">
            куплено {formatNumber(b.purchasedCount)} шт
            {b.lastPurchaseAt && ` · последняя закупка ${formatDate(b.lastPurchaseAt)}`}
          </p>
        </div>
      ),
    },
    {
      header: "Закупка",
      hint: "за штуку",
      align: "right",
      // Цену в таблице заполняют не всегда — пустую не выдумываем
      render: (b) =>
        b.unitCost > 0 ? (
          <span className="text-ink-2">{formatMoney(b.unitCost)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      header: "Продажа",
      hint: "за штуку",
      align: "right",
      render: (b) =>
        b.salePrice > 0 ? (
          <span className="font-medium">{formatMoney(b.salePrice)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      header: "Наценка",
      align: "right",
      render: (b) => {
        const margin = b.salePrice - b.unitCost;
        if (b.salePrice <= 0 || b.unitCost <= 0) return <span className="text-ink-3">—</span>;
        return (
          <span className={margin > 0 ? "text-good-text" : "text-ink-3"}>
            {margin > 0 ? "+" : ""}
            {formatMoney(margin)}
          </span>
        );
      },
    },
    {
      header: "На складе",
      hint: "Qoldiq",
      align: "right",
      render: (b) => (
        <Badge tone={b.stock <= 0 ? "critical" : b.stock < LOW_STOCK ? "warning" : "good"} dot>
          {b.stock <= 0 ? "нет" : `${formatNumber(b.stock)} шт`}
        </Badge>
      ),
    },
    {
      header: "Стоимость склада",
      hint: "остаток × закупка",
      align: "right",
      render: (b) => (
        <span className="text-ink-2">{formatMoney(Math.max(b.stock, 0) * b.unitCost, true)}</span>
      ),
    },
    {
      header: "Продано",
      align: "right",
      render: (b) => (
        <div>
          <p className="font-medium">{formatNumber(b.soldCount)} шт</p>
          <p className="text-[11px] text-good-text">+{formatMoney(b.soldAmount, true)}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Книги"
        hint="Kitoblar — склад, цены и продажи учебников"
        stats={[
          { label: "Наименований", value: formatNumber(ds.books.length) },
          { label: "На складе", value: `${formatNumber(stockUnits)} шт` },
          { label: "Стоимость склада", value: formatMoney(stockValue, true) },
          { label: "Заработок", value: formatMoney(profit, true), tone: "good" },
          {
            label: "Заканчиваются",
            value: formatNumber(lowCount),
            tone: lowCount > 0 ? "critical" : "neutral",
          },
        ]}
      />
      <ListToolbar placeholder="Название книги…" filters={FILTERS} />
      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(b) => b.id}
        minWidth={980}
        empty="Книг пока нет — загрузите таблицу командой npm run import:books"
      />
      <Pagination {...page} params={params as Record<string, string | undefined>} />

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Последние продажи" hint="Sotuv — кому и за сколько" />
          <ul className="divide-y divide-line">
            {sales.map((move) => (
              <li key={move.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{move.bookTitle}</span>
                  <span className="block truncate text-[11px] text-ink-3">
                    {move.counterparty ?? "Покупатель не указан"} · {move.quantity} шт ·{" "}
                    {METHOD_LABELS[move.method].ru}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[13px] font-medium text-good-text">
                    +{formatMoney(move.amount, true)}
                  </span>
                  <span className="tnum block text-[11px] text-ink-3">
                    {formatDate(move.happenedAt)}
                  </span>
                </span>
              </li>
            ))}
            {sales.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-ink-3">Продаж пока нет</li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Последние закупки" hint="Buyurtma — что заказывали" />
          <ul className="divide-y divide-line">
            {purchases.map((move) => (
              <li key={move.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{move.bookTitle}</span>
                  <span className="block truncate text-[11px] text-ink-3">
                    {move.quantity} шт × {formatMoney(move.unitPrice)} ·{" "}
                    {METHOD_LABELS[move.method].ru}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[13px] font-medium text-critical-text">
                    −{formatMoney(move.amount, true)}
                  </span>
                  <span className="tnum block text-[11px] text-ink-3">
                    {formatDate(move.happenedAt)}
                  </span>
                </span>
              </li>
            ))}
            {purchases.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-ink-3">Закупок пока нет</li>
            )}
          </ul>
        </Card>
      </section>
    </div>
  );
}
