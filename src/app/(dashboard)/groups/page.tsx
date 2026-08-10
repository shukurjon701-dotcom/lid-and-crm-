import { redirect } from "next/navigation";
import { Meter } from "@/components/charts/bars";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatNumber, formatPercent } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { GroupRec } from "@/server/data/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "full", label: "Заполнены" },
  { value: "free", label: "Есть места" },
  { value: "empty", label: "Пустые" },
];

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "groups.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = [...ds.groups];
  const fill = (g: GroupRec) => (g.capacity > 0 ? g.studentsCount / g.capacity : 0);

  if (params.filter === "full") rows = rows.filter((g) => fill(g) >= 0.8);
  else if (params.filter === "free") rows = rows.filter((g) => fill(g) < 0.8 && g.studentsCount > 0);
  else if (params.filter === "empty") rows = rows.filter((g) => g.studentsCount === 0);

  rows = search(rows, params.q, (g) => [g.name, g.courseName, g.teacherName]);
  rows.sort((a, b) => b.studentsCount - a.studentsCount);

  const page = paginate(rows, pageNumber(params.page));
  const totalStudents = ds.groups.reduce((a, g) => a + g.studentsCount, 0);
  const totalSeats = ds.groups.reduce((a, g) => a + g.capacity, 0);

  const columns: Column<GroupRec>[] = [
    {
      header: "Группа",
      render: (g) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{g.name}</p>
          <p className="truncate text-[11px] text-ink-3">{g.courseName}</p>
        </div>
      ),
    },
    { header: "Преподаватель", render: (g) => <span className="text-ink-2">{g.teacherName}</span> },
    {
      header: "Заполненность",
      width: "34%",
      render: (g) => (
        <Meter
          value={g.studentsCount}
          max={Math.max(g.capacity, 1)}
          label={<span className="text-ink-3">{formatPercent(fill(g) * 100, 0)}</span>}
          right={`${g.studentsCount}/${g.capacity}`}
        />
      ),
    },
    {
      header: "Свободно",
      align: "right",
      render: (g) => {
        const free = Math.max(g.capacity - g.studentsCount, 0);
        return free > 0 ? (
          <span className="text-ink-2">{free} мест</span>
        ) : (
          <span className="text-ink-3">нет</span>
        );
      },
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Группы"
        hint="Guruhlar — из Sahab"
        stats={[
          { label: "Групп", value: formatNumber(ds.groups.length) },
          { label: "Учеников в них", value: formatNumber(totalStudents), tone: "good" },
          {
            label: "Загрузка",
            value: formatPercent(totalSeats ? (totalStudents / totalSeats) * 100 : 0, 0),
          },
        ]}
      />
      <ListToolbar placeholder="Название, курс или преподаватель…" filters={FILTERS} />
      <DataTable columns={columns} rows={page.items} rowKey={(g) => g.id} minWidth={780} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
    </div>
  );
}
