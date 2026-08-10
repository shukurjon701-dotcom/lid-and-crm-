import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { StudentRec } from "@/server/data/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "risk", label: "Не дошли до 2-го урока" },
  { value: "dropped3", label: "Бросили до 3-го" },
  { value: "regular", label: "Ходят стабильно" },
];

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "attendance.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  // Посещаемость ведёт Sahab: у каждой записи в группу есть число посещённых уроков
  let rows = ds.students.filter((s) => s.groupId !== "—" && s.status !== "LEFT");

  if (params.filter === "risk") rows = rows.filter((s) => s.lessonsAttended <= 1);
  else if (params.filter === "dropped3") rows = rows.filter((s) => s.lessonsAttended === 2);
  else if (params.filter === "regular") rows = rows.filter((s) => s.lessonsAttended >= 5);

  rows = search(rows, params.q, (s) => [s.fullName, s.groupName, s.publicId]);
  rows.sort((a, b) => a.lessonsAttended - b.lessonsAttended);

  const page = paginate(rows, pageNumber(params.page));

  const enrolled = ds.students.filter((s) => s.groupId !== "—" && s.status !== "LEFT");
  const reached2 = enrolled.filter((s) => s.lessonsAttended >= 2).length;
  const reached3 = enrolled.filter((s) => s.lessonsAttended >= 3).length;

  const columns: Column<StudentRec>[] = [
    {
      header: "Ученик",
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.fullName}</p>
          <p className="tnum text-[11px] text-ink-3">{s.publicId}</p>
        </div>
      ),
    },
    { header: "Группа", render: (s) => <span className="text-ink-2">{s.groupName}</span> },
    {
      header: "Посещено уроков",
      hint: "Davomat",
      align: "right",
      render: (s) => <span className="font-medium">{s.lessonsAttended}</span>,
    },
    {
      header: "Этап",
      render: (s) =>
        s.lessonsAttended >= 3 ? (
          <Badge tone="good" dot>
            закрепился
          </Badge>
        ) : s.lessonsAttended === 2 ? (
          <Badge tone="warning" dot>
            2-й урок
          </Badge>
        ) : (
          <Badge tone="critical" dot>
            только 1-й
          </Badge>
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
        title="Посещаемость"
        hint="Davomat — сколько уроков посетил каждый ученик"
        stats={[
          { label: "Занимаются", value: formatNumber(enrolled.length) },
          {
            label: "Дошли до 2-го",
            value: `${formatNumber(reached2)} · ${formatPercent(enrolled.length ? (reached2 / enrolled.length) * 100 : 0, 0)}`,
            tone: "good",
          },
          {
            label: "Дошли до 3-го",
            value: `${formatNumber(reached3)} · ${formatPercent(enrolled.length ? (reached3 / enrolled.length) * 100 : 0, 0)}`,
            tone: "good",
          },
        ]}
      />
      <ListToolbar placeholder="Имя, группа или ID…" filters={FILTERS} />
      <DataTable columns={columns} rows={page.items} rowKey={(s) => s.id} minWidth={780} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
      <p className="mt-3 text-[11px] text-ink-3">
        Список отсортирован от самых «шатких»: сверху те, кто был только на первом
        уроке — им стоит позвонить в первую очередь.
      </p>
    </div>
  );
}
