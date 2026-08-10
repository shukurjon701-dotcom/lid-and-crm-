import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatNumber, formatPercent, formatTime } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { VisitRec } from "@/server/data/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "arrived", label: "Пришли" },
  { value: "missed", label: "Не пришли" },
  { value: "sale", label: "Закончились продажей" },
];

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "leads.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = [...ds.visits].sort((a, b) => +b.scheduledAt - +a.scheduledAt);

  if (params.filter === "arrived") rows = rows.filter((v) => v.didArrive);
  else if (params.filter === "missed") rows = rows.filter((v) => !v.didArrive);
  else if (params.filter === "sale") rows = rows.filter((v) => v.resultSale);

  rows = search(rows, params.q, (v) => [v.leadName, v.invitedByName]);

  const page = paginate(rows, pageNumber(params.page));
  const arrived = ds.visits.filter((v) => v.didArrive).length;
  const sales = ds.visits.filter((v) => v.resultSale).length;

  const columns: Column<VisitRec>[] = [
    { header: "Кто", render: (v) => <span className="font-medium">{v.leadName}</span> },
    { header: "Пригласил", render: (v) => <span className="text-ink-2">{v.invitedByName}</span> },
    {
      header: "Записан на",
      render: (v) => (
        <span className="text-ink-2">
          {formatDate(v.scheduledAt)}
          <span className="ml-1.5 text-[11px] text-ink-3">{formatTime(v.scheduledAt)}</span>
        </span>
      ),
    },
    {
      header: "Пришёл",
      render: (v) =>
        v.didArrive ? (
          <Badge tone="good" dot>
            да
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            нет
          </Badge>
        ),
    },
    {
      header: "Результат",
      align: "right",
      render: (v) =>
        v.resultSale ? (
          <Badge tone="good">продажа</Badge>
        ) : v.didArrive ? (
          <span className="text-ink-3">думает</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Визиты"
        hint="Tashriflar — записи на пробный урок"
        stats={[
          { label: "Всего", value: formatNumber(ds.visits.length) },
          {
            label: "Дошли",
            value: `${formatNumber(arrived)} · ${formatPercent(ds.visits.length ? (arrived / ds.visits.length) * 100 : 0, 0)}`,
            tone: "good",
          },
          { label: "Продажи", value: formatNumber(sales), tone: "good" },
        ]}
      />
      <ListToolbar placeholder="Имя или оператор…" filters={FILTERS} />
      <DataTable columns={columns} rows={page.items} rowKey={(v) => v.id} minWidth={760} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
    </div>
  );
}
