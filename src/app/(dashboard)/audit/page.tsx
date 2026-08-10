import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { DataTable, ListHeader, Pagination, type Column } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { pageNumber, paginate, search, type ListParams } from "@/lib/list";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatNumber, formatTime } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import type { AuditRec } from "@/server/data/types";
import type { AuditAction } from "@/types/domain";

export const dynamic = "force-dynamic";

const META: Partial<Record<AuditAction, { label: string; tone: BadgeTone }>> = {
  CREATE: { label: "Создано", tone: "neutral" },
  UPDATE: { label: "Изменено", tone: "neutral" },
  DELETE: { label: "Удалено", tone: "critical" },
  STATUS_CHANGE: { label: "Смена статуса", tone: "accent" },
  CONVERT: { label: "Лид → Ученик", tone: "good" },
  PAYMENT_CREATE: { label: "Оплата", tone: "good" },
  EXPENSE_CREATE: { label: "Расход", tone: "warning" },
  FREEZE: { label: "Заморозка", tone: "accent" },
  UNFREEZE: { label: "Разморозка", tone: "accent" },
  DEBT_OPENED: { label: "Возник долг", tone: "critical" },
  DEBT_CLOSED: { label: "Долг закрыт", tone: "good" },
  LOGIN: { label: "Вход", tone: "neutral" },
  LOGOUT: { label: "Выход", tone: "neutral" },
  CHECK_IN: { label: "Пришёл", tone: "good" },
  CHECK_OUT: { label: "Ушёл", tone: "neutral" },
};

const FILTERS = [
  { value: "DEBT_OPENED", label: "Долги" },
  { value: "FREEZE", label: "Заморозки" },
  { value: "EXPENSE_CREATE", label: "Расходы" },
  { value: "CONVERT", label: "Переводы в ученики" },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<ListParams>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "audit.read")) redirect("/");

  const params = await searchParams;
  const ds = await getDataset();

  let rows = [...ds.audit].sort((a, b) => +b.createdAt - +a.createdAt);
  if (params.filter) rows = rows.filter((a) => a.action === params.filter);
  rows = search(rows, params.q, (a) => [a.entityLabel, a.actorName, a.reason]);

  const page = paginate(rows, pageNumber(params.page));

  const columns: Column<AuditRec>[] = [
    {
      header: "Событие",
      render: (a) => {
        const meta = META[a.action] ?? { label: a.action, tone: "neutral" as BadgeTone };
        return (
          <Badge tone={meta.tone} dot>
            {meta.label}
          </Badge>
        );
      },
    },
    {
      header: "Объект",
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{a.entityLabel}</p>
          {a.reason && <p className="truncate text-[11px] text-ink-3">{a.reason}</p>}
        </div>
      ),
    },
    {
      header: "Что изменилось",
      render: (a) =>
        a.field ? (
          <span className="text-[11px] text-ink-2">
            <span className="text-ink-3">{a.field}: </span>
            {a.oldValue && <span className="line-through">{a.oldValue}</span>}
            {a.oldValue && " → "}
            <span>{short(a.newValue)}</span>
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      header: "Кто",
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate text-ink-2">{a.actorName}</p>
          {a.actorRole && (
            <p className="truncate text-[11px] text-ink-3">{ROLE_LABELS[a.actorRole]}</p>
          )}
        </div>
      ),
    },
    {
      header: "Когда",
      align: "right",
      render: (a) => (
        <span className="text-ink-3">
          {formatDate(a.createdAt)}
          <span className="ml-1.5 text-[11px]">{formatTime(a.createdAt)}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="rise">
      <ListHeader
        title="История изменений"
        hint="Кто, что и когда сделал — записи не редактируются и не удаляются"
        stats={[
          { label: "Событий", value: formatNumber(ds.audit.length) },
          {
            label: "Долгов зафиксировано",
            value: formatNumber(ds.audit.filter((a) => a.action === "DEBT_OPENED").length),
            tone: "critical",
          },
          {
            label: "Заморозок",
            value: formatNumber(ds.audit.filter((a) => a.action === "FREEZE").length),
          },
        ]}
      />
      <ListToolbar placeholder="Объект, автор или причина…" filters={FILTERS} />
      <DataTable columns={columns} rows={page.items} rowKey={(a) => a.id} minWidth={900} />
      <Pagination {...page} params={params as Record<string, string | undefined>} />
    </div>
  );
}

function short(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
  return value.length > 26 ? `${value.slice(0, 26)}…` : value;
}
