import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatNumber, initials } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { StaffRec } from "@/server/data/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "BRANCH_ADMIN", label: "Администраторы" },
  { value: "OPERATOR", label: "Операторы" },
  { value: "TEACHER", label: "Преподаватели" },
  { value: "inactive", label: "Отключённые" },
];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "users.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = [...ds.staff];
  if (params.filter === "inactive") rows = rows.filter((u) => !u.isActive);
  else if (params.filter) rows = rows.filter((u) => u.role === params.filter);

  rows = search(rows, params.q, (u) => [u.fullName, u.login]);
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));

  const page = paginate(rows, pageNumber(params.page));
  const callsByUser = new Map<string, number>();
  for (const c of ds.calls) callsByUser.set(c.operatorId, (callsByUser.get(c.operatorId) ?? 0) + 1);

  const columns: Column<StaffRec>[] = [
    {
      header: "Сотрудник",
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2">
            {initials(u.fullName) || "·"}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{u.fullName}</p>
            <p className="tnum truncate text-[11px] text-ink-3">{u.login}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Роль",
      render: (u) => (
        <Badge tone={u.role === "BRANCH_ADMIN" || u.role === "OWNER" ? "accent" : "neutral"}>
          {ROLE_LABELS[u.role]}
        </Badge>
      ),
    },
    {
      header: "Звонков",
      hint: "за период",
      align: "right",
      render: (u) => {
        const n = callsByUser.get(u.id) ?? 0;
        return n > 0 ? <span className="font-medium">{formatNumber(n)}</span> : <span className="text-ink-3">—</span>;
      },
    },
    {
      header: "Доступ",
      render: (u) =>
        u.isActive ? (
          <Badge tone="good" dot>
            активен
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            отключён
          </Badge>
        ),
    },
    {
      header: "Заведён",
      align: "right",
      render: (u) => <span className="text-ink-3">{formatDate(u.createdAt)}</span>,
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="Сотрудники"
        hint="Xodimlar — учётные записи системы"
        stats={[
          { label: "Всего", value: formatNumber(ds.staff.length) },
          {
            label: "Активных",
            value: formatNumber(ds.staff.filter((u) => u.isActive).length),
            tone: "good",
          },
          {
            label: "Звонили за период",
            value: formatNumber(new Set(ds.calls.map((c) => c.operatorId)).size),
          },
        ]}
      />
      <ListToolbar placeholder="Имя или логин…" filters={FILTERS} />
      <DataTable columns={columns} rows={page.items} rowKey={(u) => u.id} minWidth={720} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
      <p className="mt-3 text-[11px] text-ink-3">
        Сотрудники с логином вида <span className="tnum">bitrix-…</span> подтянуты из Bitrix24
        для отчётов по звонкам — входить в систему они не могут. Учётка с именем «.» — это
        служебная запись Bitrix без имени.
      </p>
    </div>
  );
}
