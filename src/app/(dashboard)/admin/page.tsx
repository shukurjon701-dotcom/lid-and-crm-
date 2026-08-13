import { redirect } from "next/navigation";
import { DoorOpen, Snowflake, UserMinus, Wallet } from "lucide-react";
import { Meter } from "@/components/charts/bars";
import { AuditFeed } from "@/components/dashboard/audit-feed";
import { Badge } from "@/components/ui/badge";
import { CardBody } from "@/components/ui/card";
import { CollapsibleCard, CollapsibleGroup } from "@/components/ui/collapsible";
import { HeroFigure, StatTile } from "@/components/ui/stat";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatDays, formatMoney, formatNumber, formatPercent } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import { adminMetrics } from "@/server/metrics/dashboards";
import { SOURCE_LABELS } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "dashboard.admin")) redirect("/");

  const m = adminMetrics(await getDataset());

  return (
    <div className="rise space-y-4">
      <CollapsibleGroup id="admin.main" title="Главное" hint="Asosiy ko'rsatkich">
        <HeroFigure
          label="Новые клиенты сегодня"
          hint="Bugun kelgan yangi mijozlar"
          value={formatNumber(m.newToday)}
          sub={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                Оплатили{" "}
                <b className="font-semibold text-ink">{m.firstPaymentsCount}</b> на{" "}
                <b className="font-semibold text-ink">{formatMoney(m.firstPaymentsAmount)}</b>
              </span>
              <span>
                Визиты <b className="font-semibold text-ink">{m.visitsArrived}</b> из{" "}
                {m.visitsToday}
              </span>
            </span>
          }
          aside={
            m.newTodayList.length > 0 ? (
              <ul className="w-full min-w-[220px] space-y-1.5 sm:w-[260px]">
                {m.newTodayList.map((student) => (
                  <li key={student.id} className="flex items-center gap-2 text-xs">
                    <span className="size-1.5 shrink-0 rounded-full bg-s3" />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{student.fullName}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">
                      {SOURCE_LABELS[student.source]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : undefined
          }
        />
      </CollapsibleGroup>

      <CollapsibleGroup
        id="admin.kpi"
        title="Ключевые показатели"
        hint="Asosiy raqamlar"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatTile
          label="Оплаты за сегодня"
          hint="Bugungi to'lovlar"
          value={formatMoney(m.paymentsTodayAmount)}
          sub={`${m.paymentsTodayCount} платеж(ей)`}
          accent="s1"
          icon={<Wallet className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Визиты сегодня"
          hint="Tashriflar"
          value={`${formatNumber(m.visitsArrived)} / ${formatNumber(m.visitsToday)}`}
          sub="пришли / записаны"
          accent="s2"
          icon={<DoorOpen className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Заморожены"
          hint="Muzlatilganlar"
          value={formatNumber(m.frozenCount)}
          sub="временно не ходят"
          accent="s4"
          icon={<Snowflake className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Ушли за месяц"
          hint="Ketganlar"
          value={formatNumber(m.leftCount)}
          sub="отток учеников"
          accent="critical"
          upIsGood={false}
          icon={<UserMinus className="size-4" strokeWidth={1.75} />}
        />
      </CollapsibleGroup>

      <CollapsibleGroup
        id="admin.retention"
        title="Удержание и должники"
        hint="Ushlab qolish va qarzdorlar"
        className="grid gap-4 lg:grid-cols-[1fr_1.3fr]"
      >
        {/* ----------------------------- Удержание ----------------------------- */}
        <CollapsibleCard
          id="admin.retention.cohort"
          title="Удержание новых учеников"
          hint="Когорта за 30 дней: дошли до 2-го и 3-го урока"
        >
          <CardBody className="space-y-5">
            <Meter
              value={m.cohortSize}
              max={m.cohortSize}
              tone="accent"
              label={<span className="font-medium text-ink">1-й урок — пришли все</span>}
              right={formatNumber(m.cohortSize)}
            />
            <Meter
              value={m.reached2}
              max={Math.max(m.cohortSize, 1)}
              tone={m.retention2 >= 80 ? "good" : m.retention2 >= 60 ? "warning" : "critical"}
              label={<span className="font-medium text-ink">2-й урок</span>}
              right={`${formatNumber(m.reached2)} · ${formatPercent(m.retention2, 0)}`}
            />
            <Meter
              value={m.reached3}
              max={Math.max(m.cohortSize, 1)}
              tone={m.retention3 >= 70 ? "good" : m.retention3 >= 50 ? "warning" : "critical"}
              label={<span className="font-medium text-ink">3-й урок</span>}
              right={`${formatNumber(m.reached3)} · ${formatPercent(m.retention3, 0)}`}
            />
            <p className="border-t border-line pt-4 text-[11px] leading-relaxed text-ink-3">
              Показывает, сколько учеников из пришедших за последние 30 дней дошли до
              второго и третьего занятия. Провал между уроками — сигнал разобраться
              с преподавателем или расписанием группы.
            </p>
          </CardBody>
        </CollapsibleCard>

        {/* ----------------------------- Должники ------------------------------ */}
        <CollapsibleCard
          id="admin.retention.debtors"
          title="Должники"
          hint="Qarzdorlar — с датой образования долга"
          action={
            <Badge tone="critical" dot>
              {m.debtorsCount}
              {m.debtorsAmount > 0 ? ` · ${formatMoney(m.debtorsAmount)}` : " человек"}
            </Badge>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-ink-3">
                  <th className="px-5 py-2.5 font-medium">Ученик</th>
                  <th className="px-3 py-2.5 font-medium">Группа</th>
                  <th className="px-3 py-2.5 text-right font-medium">Долг</th>
                  <th className="px-5 py-2.5 text-right font-medium">Просрочка</th>
                </tr>
              </thead>
              <tbody>
                {m.debtors.map((student) => (
                  <tr
                    key={student.id}
                    className="border-b border-line last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-5 py-2.5">
                      <p className="truncate font-medium">{student.fullName}</p>
                      <p className="tnum text-[11px] text-ink-3">{student.publicId}</p>
                    </td>
                    <td className="px-3 py-2.5 text-ink-2">{student.groupName}</td>
                    <td className="tnum px-3 py-2.5 text-right font-medium text-critical-text">
                      {student.debt > 0 ? formatMoney(student.debt) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Badge tone={student.daysInDebt > 14 ? "critical" : "warning"} dot>
                        {formatDays(student.daysInDebt)}
                      </Badge>
                      <p className="tnum mt-0.5 text-[10px] text-ink-3">
                        с {formatDate(student.debtSince!)}
                      </p>
                    </td>
                  </tr>
                ))}
                {m.debtors.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-ink-3">
                      Должников нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CollapsibleCard>
      </CollapsibleGroup>

      {/* ------------------------- Заморозки и уходы ------------------------- */}
      <CollapsibleGroup
        id="admin.status"
        title="Заморозки и уходы"
        hint="Muzlatilganlar va ketganlar"
        className="grid gap-4 lg:grid-cols-2"
      >
        <CollapsibleCard id="admin.status.frozen" title="Замороженные" hint="Muzlatilganlar">
          <ul className="divide-y divide-line">
            {m.frozenList.map((student) => (
              <li key={student.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{student.fullName}</span>
                  <span className="block text-[11px] text-ink-3">{student.groupName}</span>
                </span>
                <span className="tnum shrink-0 text-[11px] text-ink-3">
                  с {student.frozenAt ? formatDate(student.frozenAt) : "—"}
                </span>
              </li>
            ))}
            {m.frozenList.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-ink-3">Никого нет</li>
            )}
          </ul>
        </CollapsibleCard>

        <CollapsibleCard id="admin.status.left" title="Ушедшие за месяц" hint="Ketganlar">
          <ul className="divide-y divide-line">
            {m.leftList.map((student) => (
              <li key={student.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{student.fullName}</span>
                  <span className="block text-[11px] text-ink-3">
                    {student.leftReason ?? "Причина не указана"}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[11px] text-ink-3">
                  {student.leftAt ? formatDate(student.leftAt) : "—"}
                </span>
              </li>
            ))}
            {m.leftList.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-ink-3">Никто не ушёл</li>
            )}
          </ul>
        </CollapsibleCard>
      </CollapsibleGroup>

      <AuditFeed id="admin.audit" items={m.audit} />
    </div>
  );
}
