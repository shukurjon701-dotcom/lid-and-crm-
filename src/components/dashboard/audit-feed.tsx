import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/ui/collapsible";
import { formatDate, formatTime } from "@/lib/utils";
import type { AuditRec } from "@/server/data/types";
import type { AuditAction } from "@/types/domain";

const META: Record<AuditAction, { label: string; tone: BadgeTone }> = {
  CREATE: { label: "Создано", tone: "neutral" },
  UPDATE: { label: "Изменено", tone: "neutral" },
  DELETE: { label: "Удалено", tone: "critical" },
  STATUS_CHANGE: { label: "Статус", tone: "accent" },
  LOGIN: { label: "Вход", tone: "neutral" },
  LOGOUT: { label: "Выход", tone: "neutral" },
  CHECK_IN: { label: "Пришёл", tone: "good" },
  CHECK_OUT: { label: "Ушёл", tone: "neutral" },
  CONVERT: { label: "Лид → Ученик", tone: "good" },
  PAYMENT_CREATE: { label: "Оплата", tone: "good" },
  PAYMENT_DELETE: { label: "Отмена оплаты", tone: "critical" },
  EXPENSE_CREATE: { label: "Расход", tone: "warning" },
  EXPENSE_DELETE: { label: "Отмена расхода", tone: "critical" },
  FREEZE: { label: "Заморозка", tone: "accent" },
  UNFREEZE: { label: "Разморозка", tone: "accent" },
  DEBT_OPENED: { label: "Долг", tone: "critical" },
  DEBT_CLOSED: { label: "Долг закрыт", tone: "good" },
  EXPORT: { label: "Выгрузка", tone: "neutral" },
  PERMISSION_CHANGE: { label: "Права", tone: "accent" },
};

/** Лента журнала изменений: кто, что и когда сделал. */
export function AuditFeed({
  id,
  items,
  title = "История изменений",
}: {
  /** Ключ, под которым запоминается, свёрнут ли блок на этом дашборде */
  id: string;
  items: AuditRec[];
  title?: string;
}) {
  return (
    <CollapsibleCard
      id={id}
      title={title}
      hint="Кто, что и когда изменил"
      action={
        <Link href="/audit" className="text-xs font-medium text-accent hover:underline">
          Весь журнал →
        </Link>
      }
    >
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const meta = META[item.action] ?? { label: item.action, tone: "neutral" as BadgeTone };
          return (
            <li key={item.id} className="flex items-start gap-3 px-5 py-3">
              <Badge tone={meta.tone} dot className="mt-0.5 shrink-0">
                {meta.label}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{item.entityLabel}</p>
                <p className="truncate text-[11px] text-ink-3">
                  {item.actorName}
                  {item.field && item.oldValue && (
                    <>
                      {" · "}
                      <span className="line-through">{item.oldValue}</span>
                      {" → "}
                      <span className="text-ink-2">{short(item.newValue)}</span>
                    </>
                  )}
                  {item.reason && ` · ${item.reason}`}
                </p>
              </div>
              <p className="tnum shrink-0 text-right text-[11px] text-ink-3">
                {isToday(item.createdAt) ? formatTime(item.createdAt) : formatDate(item.createdAt)}
              </p>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-ink-3">Событий пока нет</li>
        )}
      </ul>
    </CollapsibleCard>
  );
}

function isToday(date: Date) {
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function short(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
  return value.length > 24 ? `${value.slice(0, 24)}…` : value;
}
