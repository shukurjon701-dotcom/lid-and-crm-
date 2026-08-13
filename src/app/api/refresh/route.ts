import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { invalidateDataset } from "@/server/data/source";
import { refreshBitrix, refreshSahabFinance } from "@/server/sync/refresh";
import { isPbxConfigured, refreshPbxCalls } from "@/server/sync/pbx";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Обновление данных: лиды и визиты из Bitrix, звонки из onlinePBX,
 * деньги из Sahab.
 *
 * Вызывается двумя способами:
 *   кнопкой в интерфейсе — тогда проверяется сессия сотрудника;
 *   по расписанию — тогда нужен ключ ?key=… из переменной SYNC_TOKEN.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 3), 1), 30);

  const byToken = Boolean(process.env.SYNC_TOKEN) && key === process.env.SYNC_TOKEN;

  if (!byToken) {
    const session = await getSession();
    if (!session || !can(session.role, "dashboard.callcenter")) {
      return NextResponse.json({ ok: false, error: "Нет доступа" }, { status: 403 });
    }
  }

  try {
    const [bitrix, finance] = await Promise.all([
      refreshBitrix(days),
      refreshSahabFinance(),
    ]);
    // Звонки тянем после лидов: свежий лид нужен, чтобы привязать к нему разговор.
    const pbx = isPbxConfigured() ? await refreshPbxCalls(days) : null;

    // Данные в базе поменялись — снимок, который держат дашборды, устарел.
    invalidateDataset();

    return NextResponse.json({
      ok: true,
      ...bitrix,
      ...finance,
      ...pbx,
      message:
        `Обновлено: ${pbx ? pbx.pbxCalls : 0} звонков, ${bitrix.leads} лидов, ` +
        `${finance.payments} платежей, ${finance.expenses} расходов`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[обновление] не удалось:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
