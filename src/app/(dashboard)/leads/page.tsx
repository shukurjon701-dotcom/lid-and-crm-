import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatNumber, formatTime } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { LeadRec } from "@/server/data/types";
import { LEAD_STATUS_LABELS, SOURCE_LABELS, type LeadStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const TONE: Record<LeadStatus, BadgeTone> = {
  NEW: "accent",
  IN_PROGRESS: "accent",
  NO_ANSWER: "neutral",
  VISIT_PLANNED: "warning",
  VISITED: "good",
  CONVERTED: "good",
  REJECTED: "critical",
  LOST: "critical",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "NEW", label: "Новые" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "VISIT_PLANNED", label: "Записаны" },
  { value: "CONVERTED", label: "Стали учениками" },
  { value: "qualified", label: "Только целевые" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "leads.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = [...ds.leads].sort((a, b) => +b.createdAt - +a.createdAt);

  if (params.filter === "qualified") rows = rows.filter((l) => l.isQualified);
  else if (params.filter) rows = rows.filter((l) => l.status === params.filter);

  rows = search(rows, params.q, (l) => [l.fullName, l.phone, l.operatorName]);

  const page = paginate(rows, pageNumber(params.page));
  const qualified = ds.leads.filter((l) => l.isQualified).length;
  const converted = ds.leads.filter((l) => l.status === "CONVERTED").length;

  const columns: Column<LeadRec>[] = [
    {
      header: "Лид",
      render: (lead) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{lead.fullName}</p>
          <p className="tnum text-[11px] text-ink-3">{lead.phone}</p>
        </div>
      ),
    },
    {
      header: "Статус",
      render: (lead) => (
        <Badge tone={TONE[lead.status]} dot>
          {LEAD_STATUS_LABELS[lead.status]}
        </Badge>
      ),
    },
    {
      header: "Целевой",
      hint: "Sifatli",
      render: (lead) =>
        lead.isQualified ? (
          <span className="text-good-text">да</span>
        ) : (
          <span className="text-ink-3">нет</span>
        ),
    },
    { header: "Источник", render: (lead) => <span className="text-ink-2">{SOURCE_LABELS[lead.source]}</span> },
    { header: "Оператор", render: (lead) => <span className="text-ink-2">{lead.operatorName}</span> },
    {
      header: "Создан",
      align: "right",
      render: (lead) => (
        <span className="text-ink-3">
          {formatDate(lead.createdAt)}
          <span className="ml-1.5 text-[11px]">{formatTime(lead.createdAt)}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Лиды"
        hint="Lidlar — заявки из Bitrix24"
        stats={[
          { label: "Всего", value: formatNumber(ds.leads.length) },
          { label: "Целевых", value: formatNumber(qualified), tone: "good" },
          { label: "Стали учениками", value: formatNumber(converted), tone: "good" },
        ]}
      />
      <ListToolbar placeholder="Имя, телефон или оператор…" filters={FILTERS} />
      <DataTable columns={columns} rows={page.items} rowKey={(l) => l.id} minWidth={860} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
    </div>
  );
}
