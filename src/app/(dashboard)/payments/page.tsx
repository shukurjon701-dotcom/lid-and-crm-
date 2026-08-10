import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatMoney, formatNumber, formatTime } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { PaymentRec } from "@/server/data/types";
import { METHOD_LABELS } from "@/types/domain";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "CASH", label: "Наличные" },
  { value: "TERMINAL", label: "Терминал" },
  { value: "CARD", label: "Карта" },
  { value: "TRANSFER", label: "Перевод" },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "payments.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = [...ds.payments].sort((a, b) => +b.paidAt - +a.paidAt);
  if (params.filter) rows = rows.filter((p) => p.method === params.filter);
  rows = search(rows, params.q, (p) => [p.studentName, p.receivedByName]);

  const page = paginate(rows, pageNumber(params.page));
  const total = ds.payments.reduce((a, p) => a + p.amount, 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthTotal = ds.payments
    .filter((p) => +p.paidAt >= +monthStart)
    .reduce((a, p) => a + p.amount, 0);

  const columns: Column<PaymentRec>[] = [
    {
      header: "Ученик",
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.studentName}</p>
          {p.isFirstPayment && <p className="text-[11px] text-good-text">первый платёж</p>}
        </div>
      ),
    },
    {
      header: "Сумма",
      align: "right",
      render: (p) => (
        <span className="font-medium text-good-text">+{formatMoney(p.amount, true)}</span>
      ),
    },
    {
      header: "Способ",
      render: (p) => <Badge tone="neutral">{METHOD_LABELS[p.method].ru}</Badge>,
    },
    { header: "Принял", render: (p) => <span className="text-ink-2">{p.receivedByName}</span> },
    {
      header: "Дата",
      align: "right",
      render: (p) => (
        <span className="text-ink-3">
          {formatDate(p.paidAt)}
          <span className="ml-1.5 text-[11px]">{formatTime(p.paidAt)}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Платежи"
        hint="To'lovlar — из Sahab"
        stats={[
          { label: "Платежей", value: formatNumber(ds.payments.length) },
          { label: "За месяц", value: formatMoney(monthTotal, true), tone: "good" },
          { label: "Всего", value: formatMoney(total, true) },
        ]}
      />
      <ListToolbar placeholder="Ученик или кто принял…" filters={FILTERS} />
      <DataTable columns={columns} rows={page.items} rowKey={(p) => p.id} minWidth={760} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
    </div>
  );
}
