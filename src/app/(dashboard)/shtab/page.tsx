import { redirect } from "next/navigation";
import { GraduationCap, Target, TrendingUp, Users } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { Donut } from "@/components/charts/donut";
import { Meter, StackedBar } from "@/components/charts/bars";
import { AuditFeed } from "@/components/dashboard/audit-feed";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { HeroFigure, StatTile } from "@/components/ui/stat";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatMoney, formatNumber, formatPercent, formatShort } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import { shtabMetrics } from "@/server/metrics/dashboards";
import { METHOD_LABELS } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function ShtabPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "dashboard.shtab")) redirect("/");

  const m = shtabMetrics(await getDataset());

  const methodSegments = (["CASH", "TERMINAL", "CARD", "TRANSFER"] as const).map(
    (method, i) => ({
      label: `${METHOD_LABELS[method].ru} · ${METHOD_LABELS[method].uz}`,
      value: m.todayByMethod[method],
      color: ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"][i],
    })
  );

  return (
    <div className="rise space-y-4">
      {/* ------------------------------- Ведущее число ------------------------------- */}
      <HeroFigure
        label="Чистая прибыль за месяц"
        hint="Sof foyda — приход минус расход"
        value={formatMoney(m.netProfit)}
        tone={m.netProfit >= 0 ? "good" : "critical"}
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Приход <b className="font-semibold text-ink">{formatMoney(m.revenueMonth)}</b>
            </span>
            <span>
              Расход <b className="font-semibold text-ink">{formatMoney(m.expenseMonth)}</b>
            </span>
            <span>
              Маржа <b className="font-semibold text-ink">{formatPercent(m.margin)}</b>
            </span>
          </span>
        }
        aside={
          <div className="w-full min-w-[240px] sm:w-[280px]">
            <p className="mb-2 text-[11px] text-ink-3">Приход за 14 дней</p>
            <AreaChart
              points={m.revenueByDay}
              format="money"
              label="Приход по дням за 14 дней"
            />
          </div>
        }
      />

      {/* ------------------------------ Ключевые метрики ----------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Активные ученики"
          hint="Faol o'quvchilar"
          value={formatNumber(m.activeStudents)}
          sub={`${m.groupsCount} групп`}
          accent="s1"
          icon={<Users className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Новые ученики за месяц"
          hint="Yangi o'quvchilar"
          value={`+${formatNumber(m.newStudentsMonth)}`}
          sub={`из ${formatNumber(m.leadsMonth)} лидов`}
          accent="s3"
          icon={<GraduationCap className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Конверсия лид → ученик"
          value={formatPercent(m.conversion)}
          sub="за текущий месяц"
          accent="s2"
          icon={<Target className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Приход сегодня"
          hint="Bugungi tushum"
          value={formatMoney(m.revenueToday)}
          deltaPct={m.revenueTodayDelta}
          accent="good"
          icon={<TrendingUp className="size-4" strokeWidth={1.75} />}
        />
      </section>

      {/* ----------------------------- Касса и структура ----------------------------- */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Касса сегодня" hint="Bugungi tushum: naqd / terminal / kart" />
          <CardBody>
            <p className="mb-4 text-[28px] leading-none font-semibold tracking-[-0.02em]">
              {formatMoney(m.revenueToday)}
            </p>
            <StackedBar segments={methodSegments} format={(v) => formatMoney(v)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ученики по направлениям" hint="Yo'nalishlar bo'yicha" />
          <CardBody>
            <Donut slices={m.byCourse} centerLabel="активных учеников" unit="уч." />
          </CardBody>
        </Card>
      </section>

      {/* ------------------------------ Группы и отток ------------------------------- */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Заполненность групп"
            hint="Guruhlar to'ldirilishi"
            action={<span className="text-xs text-ink-3">{m.groupsFilled.length} групп</span>}
          />
          <CardBody className="scroll-slim max-h-[320px] space-y-3.5 overflow-y-auto">
            {m.groupsFilled.map((group) => (
              <Meter
                key={group.id}
                value={group.studentsCount}
                max={group.capacity}
                label={
                  <span>
                    {group.name}
                    <span className="ml-2 text-ink-3">{group.courseName}</span>
                  </span>
                }
                right={`${group.studentsCount}/${group.capacity}`}
              />
            ))}
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatTile
            label="Заморожены"
            hint="Muzlatilganlar"
            value={formatNumber(m.frozenStudents)}
            sub="временно не ходят"
            accent="s4"
          />
          <StatTile
            label="Ушли за месяц"
            hint="Ketganlar"
            value={formatNumber(m.leftThisMonth)}
            sub="отток учеников"
            accent="critical"
          />
          <StatTile
            label="Должники"
            hint="Qarzdorlar"
            value={formatNumber(m.debtorsCount)}
            sub={
              m.debtorsAmount > 0
                ? `на ${formatMoney(m.debtorsAmount)}`
                : "сумма в таблице не указана"
            }
            accent="critical"
            className="sm:col-span-2 lg:col-span-1"
          />
        </div>
      </section>

      <AuditFeed items={m.audit} />

      <p className="pt-1 text-center text-[11px] text-ink-3">
        Средний чек за месяц:{" "}
        {formatShort(m.newStudentsMonth ? m.revenueMonth / Math.max(m.activeStudents, 1) : 0)}{" "}
        сум на ученика
      </p>
    </div>
  );
}
