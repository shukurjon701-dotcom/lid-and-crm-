import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { refreshBitrix } from "@/server/sync/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Обновление данных Bitrix.
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
    const result = await refreshBitrix(days);
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Обновлено: ${result.calls} звонков, ${result.leads} лидов, ${result.visits} визитов`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[обновление] не удалось:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
