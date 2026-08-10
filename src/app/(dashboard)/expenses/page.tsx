import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { ExpenseRec } from "@/server/data/types";
import { METHOD_LABELS } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "expenses.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  // Фильтры — по самым крупным статьям расхода
  const byCategory = new Map<string, number>();
  for (const e of ds.expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const filters = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => ({ value: name, label: name }));

  let rows = [...ds.expenses].sort((a, b) => +b.spentAt - +a.spentAt);
  if (params.filter) rows = rows.filter((e) => e.category === params.filter);
  rows = search(rows, params.q, (e) => [e.title, e.category, e.authorName]);

  const page = paginate(rows, pageNumber(params.page));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthTotal = ds.expenses
    .filter((e) => +e.spentAt >= +monthStart)
    .reduce((a, e) => a + e.amount, 0);
  const shown = rows.reduce((a, e) => a + e.amount, 0);

  const columns: Column<ExpenseRec>[] = [
    {
      header: "Расход",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{e.title}</p>
          <p className="truncate text-[11px] text-ink-3">{e.category}</p>
        </div>
      ),
    },
    {
      header: "Сумма",
      align: "right",
      render: (e) => (
        <span className="font-medium text-critical-text">−{formatMoney(e.amount, true)}</span>
      ),
    },
    { header: "Способ", render: (e) => <Badge tone="neutral">{METHOD_LABELS[e.method].ru}</Badge> },
    {
      header: "Автор",
      hint: "кто провёл",
      render: (e) => <span className="text-ink-2">{e.authorName}</span>,
    },
    {
      header: "Дата",
      align: "right",
      render: (e) => <span className="text-ink-3">{formatDate(e.spentAt)}</span>,
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Расходы"
        hint="Rasxod — Sahab и таблица книг"
        stats={[
          { label: "Записей", value: formatNumber(ds.expenses.length) },
          { label: "За месяц", value: formatMoney(monthTotal, true), tone: "critical" },
          { label: "В списке", value: formatMoney(shown, true) },
        ]}
      />
      <ListToolbar placeholder="Название, статья или автор…" filters={filters} />
      <DataTable columns={columns} rows={page.items} rowKey={(e) => e.id} minWidth={760} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
    </div>
  );
}
