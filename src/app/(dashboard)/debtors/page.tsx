import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatDays, formatMoney, formatNumber } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import { debtOf, isDebtor } from "@/server/metrics/dashboards";
import type { StudentRec } from "@/server/data/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "old", label: "Больше месяца" },
  { value: "new", label: "Меньше недели" },
  { value: "frozen", label: "Замороженные" },
];

const daysInDebt = (student: StudentRec) => {
  if (!student.debtSince) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((+today - +student.debtSince) / 86_400_000));
};

export default async function DebtorsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "debtors.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = ds.students.filter(isDebtor);

  if (params.filter === "old") rows = rows.filter((s) => daysInDebt(s) > 30);
  else if (params.filter === "new") rows = rows.filter((s) => daysInDebt(s) <= 7);
  else if (params.filter === "frozen") rows = rows.filter((s) => s.status === "FROZEN");

  rows = search(rows, params.q, (s) => [s.fullName, s.phone, s.publicId, s.groupName]);
  rows.sort((a, b) => daysInDebt(b) - daysInDebt(a));

  const page = paginate(rows, pageNumber(params.page));
  const all = ds.students.filter(isDebtor);
  const totalDebt = all.reduce((a, s) => a + debtOf(s), 0);
  const older30 = all.filter((s) => daysInDebt(s) > 30).length;

  const columns: Column<StudentRec>[] = [
    {
      header: "Ученик",
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.fullName}</p>
          <p className="tnum text-[11px] text-ink-3">
            {s.publicId} · {s.phone}
          </p>
        </div>
      ),
    },
    { header: "Группа", render: (s) => <span className="text-ink-2">{s.groupName}</span> },
    {
      header: "Долг",
      align: "right",
      render: (s) =>
        debtOf(s) > 0 ? (
          <span className="font-medium text-critical-text">{formatMoney(debtOf(s), true)}</span>
        ) : (
          <span className="text-ink-3">не указан</span>
        ),
    },
    {
      header: "Просрочка",
      align: "right",
      render: (s) => (
        <div>
          <Badge tone={daysInDebt(s) > 30 ? "critical" : daysInDebt(s) > 7 ? "warning" : "neutral"} dot>
            {formatDays(daysInDebt(s))}
          </Badge>
          {s.debtSince && (
            <p className="tnum mt-0.5 text-[10px] text-ink-3">с {formatDate(s.debtSince)}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Должники"
        hint="Qarzdorlar — по данным Sahab"
        stats={[
          { label: "Должников", value: formatNumber(all.length), tone: "critical" },
          { label: "Сумма долга", value: formatMoney(totalDebt, true), tone: "critical" },
          { label: "Больше месяца", value: formatNumber(older30) },
        ]}
      />
      <ListToolbar placeholder="Имя, телефон, ID или группа…" filters={FILTERS} />
      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(s) => s.id}
        minWidth={760}
        empty="Должников нет"
      />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
      <p className="mt-3 text-[11px] text-ink-3">
        Сверху — самые давние долги. Дату начала долга система фиксирует в журнале
        изменений, поэтому видно, когда именно ученик перестал платить.
      </p>
    </div>
  );
}
