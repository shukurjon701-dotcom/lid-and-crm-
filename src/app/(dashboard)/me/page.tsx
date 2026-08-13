import { redirect } from "next/navigation";
import { Award, GraduationCap, PhoneCall, Sparkles, Target, Wallet } from "lucide-react";
import { Meter } from "@/components/charts/bars";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { CollapsibleCard, CollapsibleGroup } from "@/components/ui/collapsible";
import { HeroFigure, StatTile } from "@/components/ui/stat";
import { ROLE_LABELS } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatNumber,
  formatTime,
} from "@/lib/utils";
import { getDataset } from "@/server/data/source";
import { personalMetrics } from "@/server/metrics/dashboards";
import { LEAD_STATUS_LABELS, SOURCE_LABELS } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function MyResultsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ds = await getDataset();
  const m = personalMetrics(ds, session);

  // Экран собирается под человека: у оператора — звонки, у преподавателя —
  // группы, у администратора — касса. Пустые блоки не показываем.
  return (
    <div className="rise space-y-4">
      <CollapsibleGroup id="me.main" title="Главное" hint="Asosiy ko'rsatkich">
        <HeroFigure
          label={`${session.fullName} · ${ROLE_LABELS[session.role]}`}
          hint="Ваши результаты"
          value={
            m.hasCalls
              ? formatNumber(m.callsToday)
              : m.hasGroups
                ? formatNumber(m.studentsCount)
                : formatMoney(m.paymentsMonthAmount)
          }
          sub={
            <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {m.hasCalls && (
                <>
                  <span>звонков сегодня</span>
                  <span>
                    За месяц <b className="font-bold text-ink">{formatNumber(m.callsMonth)}</b>
                  </span>
                  <span>
                    В разговоре{" "}
                    <b className="font-bold text-ink">{formatDuration(m.talkMinutesToday)}</b>
                  </span>
                </>
              )}
              {!m.hasCalls && m.hasGroups && (
                <>
                  <span>учеников в ваших группах</span>
                  <span>
                    Групп <b className="font-bold text-ink">{m.groups.length}</b>
                  </span>
                </>
              )}
              {!m.hasCalls && !m.hasGroups && (
                <>
                  <span>принято за месяц</span>
                  <span>
                    Платежей <b className="font-bold text-ink">{m.paymentsMonthCount}</b>
                  </span>
                </>
              )}
            </span>
          }
          aside={
            m.place ? (
              <div className="text-center">
                <p className="text-[11px] font-bold text-ink-3">Место сегодня</p>
                <p className="mt-1 text-[44px] leading-none font-extrabold tracking-[-0.04em] text-accent">
                  {m.place}
                </p>
                <p className="mt-1 text-[11px] text-ink-3">из {m.boardSize} операторов</p>
              </div>
            ) : undefined
          }
        />
      </CollapsibleGroup>

      {/* ------------------------------- Оператор ------------------------------- */}
      {m.hasCalls && (
        <>
          <CollapsibleGroup
            id="me.kpi"
            title="Ключевые показатели"
            hint="Asosiy raqamlar"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <StatTile
              label="Звонки сегодня"
              hint="Bugungi qo'ng'iroqlar"
              value={formatNumber(m.callsToday)}
              deltaPct={m.callsTodayDelta}
              sub={`всего ${formatNumber(m.callsTotal)}`}
              accent="s1"
              icon={<PhoneCall className="size-4" strokeWidth={2} />}
            />
            <StatTile
              label="Лиды за месяц"
              hint="Kunlik lid soni"
              value={formatNumber(m.leadsMonth)}
              sub={`сегодня ${m.leadsToday}`}
              accent="s2"
              icon={<Target className="size-4" strokeWidth={2} />}
            />
            <StatTile
              label="Целевые лиды"
              hint="Sifatli lid"
              value={formatNumber(m.qualifiedMonth)}
              sub={`из них учениками стали ${m.convertedMonth}`}
              accent="s3"
              icon={<Sparkles className="size-4" strokeWidth={2} />}
            />
            <StatTile
              label="Визиты за месяц"
              hint="Tashriflar"
              value={`${formatNumber(m.visitsArrived)} / ${formatNumber(m.visitsMonth)}`}
              sub="дошли / записаны"
              accent="s4"
              icon={<Award className="size-4" strokeWidth={2} />}
            />
          </CollapsibleGroup>

          <CollapsibleGroup
            id="me.calls"
            title="Звонки и лиды"
            hint="Qo'ng'iroqlar va lidlar"
            className="grid gap-4 lg:grid-cols-2"
          >
            <CollapsibleCard id="me.calls.recent" title="Звонки сегодня" hint="Последние восемь">
              <ul className="divide-y divide-line">
                {m.recentCalls.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="tnum block truncate text-[13px]">{c.leadName}</span>
                      <span className="block text-[11px] text-ink-3">
                        {c.result === "ANSWERED" ? "дозвонились" : "не ответили"}
                        {c.isLesson && " · консультация"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-[12.5px] font-bold">
                        {formatDuration(Math.round(c.durationSeconds / 60))}
                      </span>
                      <span className="tnum block text-[11px] text-ink-3">
                        {formatTime(c.calledAt)}
                      </span>
                    </span>
                  </li>
                ))}
                {m.recentCalls.length === 0 && (
                  <li className="px-5 py-10 text-center text-sm text-ink-3">
                    Сегодня звонков ещё не было
                  </li>
                )}
              </ul>
            </CollapsibleCard>

            <CollapsibleCard id="me.calls.leads" title="Ваши лиды" hint="За текущий месяц">
              <ul className="divide-y divide-line">
                {m.recentLeads.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{l.fullName}</span>
                      <span className="block truncate text-[11px] text-ink-3">
                        {SOURCE_LABELS[l.source]} · {LEAD_STATUS_LABELS[l.status]}
                      </span>
                    </span>
                    {l.isQualified && (
                      <Badge tone="fresh" dot>
                        Sifatli
                      </Badge>
                    )}
                    <span className="tnum shrink-0 text-[11px] text-ink-3">
                      {formatDate(l.createdAt)}
                    </span>
                  </li>
                ))}
                {m.recentLeads.length === 0 && (
                  <li className="px-5 py-10 text-center text-sm text-ink-3">
                    Лидов за месяц пока нет
                  </li>
                )}
              </ul>
            </CollapsibleCard>
          </CollapsibleGroup>
        </>
      )}

      {/* ---------------------------- Преподаватель ---------------------------- */}
      {m.hasGroups && (
        <CollapsibleGroup
          id="me.groups"
          title="Ваши группы"
          hint="Guruhlar va o'quvchilar"
          className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"
        >
          <CollapsibleCard
            id="me.groups.list"
            title="Ваши группы"
            hint="Guruhlar"
            action={<span className="text-xs text-ink-3">{m.groups.length}</span>}
          >
            <CardBody className="space-y-4">
              {m.groups.map((g) => (
                <Meter
                  key={g.id}
                  value={g.studentsCount}
                  max={Math.max(g.capacity, 1)}
                  label={
                    <span>
                      {g.name}
                      <span className="ml-2 text-ink-3">{g.courseName}</span>
                    </span>
                  }
                  right={`${g.studentsCount}/${g.capacity}`}
                />
              ))}
            </CardBody>
          </CollapsibleCard>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <StatTile
              label="Учеников у вас"
              hint="O'quvchilar"
              value={formatNumber(m.studentsCount)}
              sub={`${m.groups.length} групп`}
              accent="s3"
              icon={<GraduationCap className="size-4" strokeWidth={2} />}
            />
            <StatTile
              label="Из них должники"
              hint="Qarzdorlar"
              value={formatNumber(m.debtorsCount)}
              sub="стоит напомнить"
              accent="critical"
              upIsGood={false}
            />
          </div>
        </CollapsibleGroup>
      )}

      {/* ----------------------------- Касса ----------------------------- */}
      {m.hasPayments && (
        <CollapsibleGroup
          id="me.cash"
          title="Ваша касса"
          hint="Qabul qilingan to'lovlar"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatTile
            label="Принято сегодня"
            hint="Bugungi to'lovlar"
            value={formatMoney(m.paymentsTodayAmount)}
            accent="good"
            icon={<Wallet className="size-4" strokeWidth={2} />}
          />
          <StatTile
            label="Принято за месяц"
            value={formatMoney(m.paymentsMonthAmount)}
            sub={`${m.paymentsMonthCount} платежей`}
            accent="s1"
          />
        </CollapsibleGroup>
      )}

      {!m.hasCalls && !m.hasGroups && !m.hasPayments && (
        <Card>
          <CardBody className="py-14 text-center">
            <p className="text-[15px] font-bold">Пока по вам нет данных</p>
            <p className="mt-2 text-sm text-ink-3">
              Показатели появятся после первой синхронизации с Sahab и Bitrix24 —
              звонки, лиды и оплаты подтянутся автоматически.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
