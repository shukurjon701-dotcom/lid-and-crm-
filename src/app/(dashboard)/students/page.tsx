import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { StudentRec } from "@/server/data/types";
import type { StudentStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Учится",
  FROZEN: "Заморожен",
  LEFT: "Ушёл",
  GRADUATED: "Выпустился",
};

const TONE: Record<StudentStatus, BadgeTone> = {
  ACTIVE: "good",
  FROZEN: "accent",
  LEFT: "neutral",
  GRADUATED: "accent",
};

const FILTERS = [
  { value: "ACTIVE", label: "Учатся" },
  { value: "FROZEN", label: "Заморожены" },
  { value: "debt", label: "Должники" },
  { value: "LEFT", label: "Ушли" },
];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "students.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  // По умолчанию показываем занимающихся: архивные карточки только по фильтру
  let rows = [...ds.students];
  if (params.filter === "debt") rows = rows.filter((s) => s.debtSince != null && s.status !== "LEFT");
  else if (params.filter) rows = rows.filter((s) => s.status === params.filter);
  else if (!params.q) rows = rows.filter((s) => s.status !== "LEFT");

  rows = search(rows, params.q, (s) => [s.fullName, s.phone, s.publicId, s.groupName]);
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));

  const page = paginate(rows, pageNumber(params.page));
  const active = ds.students.filter((s) => s.status === "ACTIVE").length;
  const frozen = ds.students.filter((s) => s.status === "FROZEN").length;

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
    {
      header: "Группа",
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate text-ink-2">{s.groupName}</p>
          {s.courseName !== "—" && (
            <p className="truncate text-[11px] text-ink-3">{s.courseName}</p>
          )}
        </div>
      ),
    },
    { header: "Статус", render: (s) => <Badge tone={TONE[s.status]} dot>{LABEL[s.status]}</Badge> },
    {
      header: "Баланс",
      align: "right",
      render: (s) =>
        s.balance < 0 ? (
          <span className="font-medium text-critical-text">{formatMoney(s.balance, true)}</span>
        ) : s.balance > 0 ? (
          <span className="text-good-text">{formatMoney(s.balance, true)}</span>
        ) : (
          <span className="text-ink-3">0</span>
        ),
    },
    {
      header: "Начал",
      align: "right",
      render: (s) => <span className="text-ink-3">{formatDate(s.startedAt)}</span>,
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Ученики"
        hint="O'quvchilar — из Sahab"
        stats={[
          { label: "Учатся", value: formatNumber(active), tone: "good" },
          { label: "Заморожены", value: formatNumber(frozen) },
          { label: "Всего карточек", value: formatNumber(ds.students.length) },
        ]}
      />
      <ListToolbar placeholder="Имя, телефон, ID или группа…" filters={FILTERS} />
      <DataTable
        columns={columns}
        rows={page.items}
        rowKey={(s) => s.id}
        minWidth={820}
        empty="Учеников не найдено. Архивные карточки показываются по фильтру «Ушли»."
      />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
    </div>
  );
}
