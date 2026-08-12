import { redirect } from "next/navigation";
import { AlertTriangle, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList, StackedBar } from "@/components/charts/bars";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { HeroFigure, StatTile } from "@/components/ui/stat";
import { can } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { formatDate, formatMoney, formatPercent, formatTime } from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import { moliyaMetrics } from "@/server/metrics/dashboards";
import { METHOD_LABELS } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function MoliyaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "dashboard.moliya")) redirect("/");

  const m = moliyaMetrics(await getDataset());

  const methodSegments = (["CASH", "TERMINAL", "CARD", "TRANSFER"] as const).map(
    (method, i) => ({
      label: `${METHOD_LABELS[method].ru} · ${METHOD_LABELS[method].uz}`,
      value: m.todayByMethod[method],
      color: ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"][i],
    })
  );

  return (
    <div className="rise space-y-4">
      <HeroFigure
        label="Поступления сегодня"
        hint="Bugungi tushum"
        value={formatMoney(m.revenueToday)}
        sub={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Платежей <b className="font-semibold text-ink">{m.paymentsTodayCount}</b>
            </span>
            <span>
              Расход сегодня{" "}
              <b className="font-semibold text-ink">{formatMoney(m.expenseToday)}</b>
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Приход за месяц"
          hint="Oylik tushum"
          value={formatMoney(m.revenueMonth)}
          deltaPct={m.revenueTodayDelta}
          accent="s1"
          icon={<TrendingUp className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Расходы за месяц"
          hint="Rasxod"
          value={formatMoney(m.expenseMonth)}
          sub="все статьи"
          upIsGood={false}
          accent="s2"
          icon={<TrendingDown className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Чистая прибыль"
          hint="Sof foyda"
          value={formatMoney(m.netProfit)}
          sub={`маржа ${formatPercent(m.margin)}`}
          accent={m.netProfit >= 0 ? "good" : "critical"}
          icon={<Receipt className="size-4" strokeWidth={1.75} />}
        />
        <StatTile
          label="Должники"
          hint="Qarzdorlar"
          value={String(m.debtorsCount)}
          sub={`на ${formatMoney(m.debtorsAmount)}`}
          accent="critical"
          upIsGood={false}
          icon={<AlertTriangle className="size-4" strokeWidth={1.75} />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Касса сегодня по способам" hint="Terminal / Naqd / Kart" />
          <CardBody>
            <StackedBar segments={methodSegments} format={(v) => formatMoney(v)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Расходы по статьям" hint="Rasxod turlari — за месяц" />
          <CardBody>
            <BarList
              rows={m.expenseByCategory}
              format={(v) => formatMoney(v)}
              color="var(--s2)"
              emptyText="Расходов за месяц нет"
            />
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Последние платежи"
            hint="Bugungi to'lovlar"
            action={<Badge tone="good" dot>{m.paymentsTodayCount} сегодня</Badge>}
          />
          <ul className="divide-y divide-line">
            {m.recentPayments.map((payment) => (
              <li key={payment.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{payment.studentName}</span>
                  <span className="block truncate text-[11px] text-ink-3">
                    {METHOD_LABELS[payment.method].ru} · принял {payment.receivedByName}
                    {payment.isFirstPayment && " · первый платёж"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[13px] font-medium text-good-text">
                    +{formatMoney(payment.amount)}
                  </span>
                  <span className="tnum block text-[11px] text-ink-3">
                    {formatTime(payment.paidAt)}
                  </span>
                </span>
              </li>
            ))}
            {m.recentPayments.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-ink-3">
                Сегодня оплат ещё не было
              </li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Последние расходы" hint="Kim, qancha va nima uchun" />
          <ul className="divide-y divide-line">
            {m.recentExpenses.map((expense) => (
              <li key={expense.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{expense.title}</span>
                  <span className="block truncate text-[11px] text-ink-3">
                    {expense.category} · автор {expense.authorName} ·{" "}
                    {METHOD_LABELS[expense.method].ru}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[13px] font-medium text-critical-text">
                    −{formatMoney(expense.amount)}
                  </span>
                  <span className="tnum block text-[11px] text-ink-3">
                    {formatDate(expense.spentAt)}
                  </span>
                </span>
              </li>
            ))}
            {m.recentExpenses.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-ink-3">Расходов нет</li>
            )}
          </ul>
        </Card>
      </section>
    </div>
  );
}
