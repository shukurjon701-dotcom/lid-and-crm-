import { redirect } from "next/navigation";
import { DoorOpen, PhoneCall, Sparkles, Target } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList, Meter } from "@/components/charts/bars";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { HeroFigure, StatTile } from "@/components/ui/stat";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import {
  formatDuration,
  formatNumber,
  formatPercent,
  formatTime,
} from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import { callCenterMetrics } from "@/server/metrics/dashboards";
import { LEAD_STATUS_LABELS, SOURCE_LABELS, type LeadSource } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function CallCenterPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "dashboard.callcenter")) redirect("/");

  const m = callCenterMetrics(await getDataset());
  const totalSales = m.salesOffline + m.salesOnline;

  return (
    <div className="rise space-y-4">
      <HeroFigure
        label="Звонков сегодня"
        hint="Bugungi qo'ng'iroqlar"
        value={formatNumber(m.callsToday)}
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Call dars <b className="font-semibold text-ink">{m.lessonsToday}</b>
            </span>
            <span>
              В разговоре{" "}
              <b className="font-semibold text-ink">{formatDuration(m.talkMinutesToday)}</b>
            </span>
            <span>
              Всего за период{" "}
              <b className="font-semibold text-ink">{formatNumber(m.callsTotal)}</b>
            </span>
          </span>
        }
        aside={
          <div className="w-full min-w-[240px] sm:w-[280px]">
            <p className="mb-2 text-[11px] text-ink-3">Звонки за 14 дней</p>
            <AreaChart
              points={m.callsByDay}
              format="count"
              color="var(--s2)"
              label="Количество звонков по дням"
            />
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Лиды за день"
          hint="Kunlik lid soni"
          value={formatNumber(m.leadsToday)}
          sub="новые заявки"
          accent="s1"
          icon={<Target className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Качественные лиды"
          hint="Sifatli lid soni"
          value={formatNumber(m.qualifiedToday)}
          sub={`${formatPercent(m.qualityRate, 0)} от всех лидов`}
          accent="s3"
          icon={<Sparkles className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Визиты в офис"
          hint="Tashriflar soni"
          value={`${formatNumber(m.visitsArrived)} / ${formatNumber(m.visitsToday)}`}
          sub="дошли / записаны"
          accent="s2"
          icon={<DoorOpen className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Уроки по телефону"
          hint="Kunlik call dars"
          value={formatNumber(m.lessonsToday)}
          sub="консультации-уроки"
          accent="s4"
          icon={<PhoneCall className="size-4" strokeWidth={1.75} />}
        />
      </section>

      {/* ------------------------------- Продажи ------------------------------- */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        <Card>
          <CardHeader title="Продажи сегодня" hint="Sotuv offline / online" />
          <CardBody className="space-y-4">
            <p className="text-[28px] leading-none font-semibold tracking-[-0.02em]">
              {formatNumber(totalSales)}
            </p>
            <Meter
              value={m.salesOffline}
              max={Math.max(totalSales, 1)}
              tone="accent"
              label={<span className="font-medium text-ink">Offline — в офисе</span>}
              right={formatNumber(m.salesOffline)}
            />
            <Meter
              value={m.salesOnline}
              max={Math.max(totalSales, 1)}
              tone="good"
              label={<span className="font-medium text-ink">Online — удалённо</span>}
              right={formatNumber(m.salesOnline)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Источники лидов" hint="За текущий месяц" />
          <CardBody>
            <BarList
              rows={m.bySource.slice(0, 6).map((row) => ({
                label: SOURCE_LABELS[row.label as LeadSource] ?? row.label,
                value: row.value,
              }))}
              format={(v) => formatNumber(v)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Последние лиды" hint="Bugungi lidlar" />
          <ul className="scroll-slim max-h-[280px] divide-y divide-line overflow-y-auto">
            {m.recentLeads.map((lead) => (
              <li key={lead.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px]">{lead.fullName}</span>
                    {lead.isQualified && (
                      <Badge tone="good" dot>
                        Sifatli
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-ink-3">
                    {SOURCE_LABELS[lead.source]} · {lead.operatorName} ·{" "}
                    {LEAD_STATUS_LABELS[lead.status]}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[11px] text-ink-3">
                  {formatTime(lead.createdAt)}
                </span>
              </li>
            ))}
            {m.recentLeads.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-ink-3">
                Сегодня лидов ещё не было
              </li>
            )}
          </ul>
        </Card>
      </section>

      {/* ---------------------------- Рейтинг операторов ---------------------------- */}
      <Card>
        <CardHeader
          title="Операторы"
          hint="Показатели за сегодня"
          action={<span className="text-xs text-ink-3">{m.perOperator.length} с активностью</span>}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">Оператор</th>
                <th className="px-3 py-2.5 text-right font-medium">Звонки</th>
                <th className="px-3 py-2.5 text-right font-medium">Call dars</th>
                <th className="px-3 py-2.5 text-right font-medium">Лиды</th>
                <th className="px-3 py-2.5 text-right font-medium">Sifatli</th>
                <th className="px-3 py-2.5 text-right font-medium">Визиты</th>
                <th className="px-5 py-2.5 text-right font-medium">В разговоре</th>
              </tr>
            </thead>
            <tbody>
              {m.perOperator.map((operator) => (
                <tr key={operator.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-5 py-3 font-medium">{operator.name}</td>
                  <td className="tnum px-3 py-3 text-right">{formatNumber(operator.callsToday)}</td>
                  <td className="tnum px-3 py-3 text-right">{formatNumber(operator.lessonsToday)}</td>
                  <td className="tnum px-3 py-3 text-right">{formatNumber(operator.leadsToday)}</td>
                  <td className="tnum px-3 py-3 text-right text-good-text">
                    {formatNumber(operator.qualifiedToday)}
                  </td>
                  <td className="tnum px-3 py-3 text-right">
                    {operator.visitsArrived}/{operator.visitsToday}
                  </td>
                  <td className="tnum px-5 py-3 text-right text-ink-2">
                    {formatDuration(operator.talkMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
