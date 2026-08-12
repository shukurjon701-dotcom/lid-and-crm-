// Без "server-only": этот же модуль запускается скриптом первичной выгрузки
// (scripts/import/pbx.ts), а в клиентские компоненты он не импортируется.
import { prisma } from "@/lib/prisma";
import { APP } from "@/config/app";

/**
 * Звонки из виртуальной АТС onlinePBX.
 *
 * Раньше звонки брались из Битрикса (voximplant.statistic.get), но телефония
 * живёт в onlinePBX: в Битрикс попадала лишь часть вызовов и нередко с чужим
 * владельцем — отсюда неверные показатели операторов. Теперь единственный
 * источник звонков — АТС, а Битрикс отвечает только за лиды и визиты.
 *
 * Оператор определяется по внутреннему номеру (User.pbxExtension).
 */

const API = "https://api2.onlinepbx.ru";

/** Разговор дольше пяти минут считаем консультацией — как и в остальных импортах. */
const LESSON_SECONDS = 300;

/** История отдаётся окнами не больше недели, берём с запасом. */
const WINDOW_SECONDS = 6 * 24 * 60 * 60;

// ------------------------------------------------------------------- доступ

type Answer<T> = { status?: string; data?: T; comment?: string; isNotAuth?: boolean };

/** Секретный ключ живёт трое суток; обновляем заранее. */
const KEY_TTL_MS = 2 * 24 * 60 * 60 * 1000;
let secret: { id: string; key: string; at: number } | null = null;

function domain() {
  const value = process.env.PBX_DOMAIN?.trim();
  if (!value) throw new Error("Не задан PBX_DOMAIN в .env (например, pbx36133.onpbx.ru)");
  return value;
}

export function isPbxConfigured() {
  return Boolean(process.env.PBX_DOMAIN?.trim() && process.env.PBX_API_KEY?.trim());
}

async function authorize() {
  const apiKey = process.env.PBX_API_KEY?.trim();
  if (!apiKey) throw new Error("Не задан PBX_API_KEY в .env");

  const response = await fetch(`${API}/${domain()}/auth.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ auth_key: apiKey }),
  });
  const json = (await response.json()) as Answer<{ key: string; key_id: string }>;
  if (json.status !== "1" || !json.data) {
    throw new Error(`onlinePBX: авторизация не удалась (${json.comment ?? response.status})`);
  }

  secret = { id: json.data.key_id, key: json.data.key, at: Date.now() };
  return secret;
}

async function pbx<T>(path: string, params: Record<string, string> = {}, retry = true): Promise<T> {
  const auth = secret && Date.now() - secret.at < KEY_TTL_MS ? secret : await authorize();

  const response = await fetch(`${API}/${domain()}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-pbx-authentication": `${auth.id}:${auth.key}`,
    },
    body: new URLSearchParams(params),
  });
  const json = (await response.json()) as Answer<T>;

  // Ключ протух раньше срока — берём новый и повторяем запрос один раз.
  if (json.isNotAuth && retry) {
    secret = null;
    return pbx<T>(path, params, false);
  }
  if (json.status !== "1" || json.data === undefined) {
    throw new Error(`onlinePBX ${path}: ${json.comment ?? `ответ ${response.status}`}`);
  }
  return json.data;
}

// -------------------------------------------------------------------- АТС

export type PbxUser = { num: string; name: string; enabled?: boolean };

type PbxEvent = {
  type: string;
  number?: string;
  /** Есть только у того номера, который снял трубку */
  answered_stamp?: number;
};

type PbxCall = {
  uuid: string;
  caller_id_number?: string;
  destination_number?: string;
  start_stamp: number;
  duration?: number;
  /** Чистое время разговора без ожидания ответа */
  user_talk_time?: number;
  hangup_cause?: string;
  accountcode?: string;
  events?: PbxEvent[];
};

/** Список внутренних номеров с именами сотрудников. */
export const fetchPbxUsers = () => pbx<PbxUser[]>("user/get.json");

export async function fetchPbxCalls(from: Date, to: Date) {
  const start = Math.floor(+from / 1000);
  const finish = Math.floor(+to / 1000);
  const calls: PbxCall[] = [];

  for (let at = start; at < finish; at += WINDOW_SECONDS) {
    const part = await pbx<PbxCall[]>("mongo_history/search.json", {
      start_stamp_from: String(at),
      start_stamp_to: String(Math.min(at + WINDOW_SECONDS, finish)),
    });
    calls.push(...part);
  }
  return calls;
}

// ------------------------------------------------------------- разбор звонка

/**
 * Чей это звонок. Исходящий инициирует сам оператор, входящий может звонить
 * сразу нескольким — тогда звонок засчитывается тому, кто снял трубку.
 */
function extensionOf(call: PbxCall, known: Set<string>) {
  const rang = (call.events ?? []).filter(
    (event) => event.type === "user" && event.number && known.has(event.number)
  );
  const answered = rang.find((event) => event.answered_stamp);
  if (answered?.number) return answered.number;
  if (rang[0]?.number) return rang[0].number;

  const caller = call.caller_id_number ?? "";
  if (known.has(caller)) return caller;
  const destination = call.destination_number ?? "";
  if (known.has(destination)) return destination;
  return null;
}

/** Номер собеседника: у входящего — кто звонил, у исходящего — кому звонили. */
const counterpartOf = (call: PbxCall) =>
  (call.accountcode === "inbound" ? call.caller_id_number : call.destination_number) || "—";

export type CallFacts = {
  extension: string;
  phone: string;
  incoming: boolean;
  /** Чистое время разговора, секунды. Ноль — трубку не сняли. */
  talkSeconds: number;
  result: "ANSWERED" | "BUSY" | "NO_ANSWER";
  isLesson: boolean;
  calledAt: Date;
};

/**
 * Разбор одной записи истории. Возвращает null, если звонок не принадлежит
 * ни одному внутреннему номеру (автоответчик, переадресация на мобильный) —
 * такие в статистику call-центра не входят.
 */
export function classifyCall(call: PbxCall, known: Set<string>): CallFacts | null {
  const extension = extensionOf(call, known);
  if (!extension) return null;

  const talkSeconds = Number(call.user_talk_time ?? 0);
  return {
    extension,
    phone: counterpartOf(call),
    incoming: call.accountcode === "inbound",
    talkSeconds,
    result:
      talkSeconds > 0 ? "ANSWERED" : call.hangup_cause === "USER_BUSY" ? "BUSY" : "NO_ANSWER",
    isLesson: talkSeconds >= LESSON_SECONDS,
    calledAt: new Date(call.start_stamp * 1000),
  };
}

/**
 * Последние девять цифр — по ним номер из АТС сходится с номером лида,
 * записанным как +998 90 123-45-67, 998901234567 или 901234567.
 */
function phoneTail(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

// ------------------------------------------------------------- операторы

/**
 * Сопоставление внутренних номеров с сотрудниками CRM.
 *
 * Сначала ищем по уже сохранённому номеру, потом по имени (сотрудник обычно
 * заведён Битриксом), и только если никого нет — заводим нового оператора.
 */
async function syncOperators(branchId: string) {
  const users = await fetchPbxUsers();
  const byExtension = new Map<string, string>();

  for (const user of users) {
    const extension = String(user.num ?? "").trim();
    if (!extension) continue;
    const fullName = String(user.name ?? "").trim() || `Оператор ${extension}`;
    const login = `pbx-${extension}`;

    const existing =
      (await prisma.user.findFirst({ where: { pbxExtension: extension }, select: { id: true } })) ??
      (await prisma.user.findUnique({ where: { login }, select: { id: true } })) ??
      (await prisma.user.findFirst({
        where: { branchId, fullName: { equals: fullName, mode: "insensitive" } },
        select: { id: true },
      }));

    if (existing) {
      // Номер уникален: если 101 передали другому сотруднику, у прежнего
      // владельца связь снимаем, иначе обновление упадёт на ограничении.
      await prisma.user.updateMany({
        where: { pbxExtension: extension, NOT: { id: existing.id } },
        data: { pbxExtension: null },
      });
      await prisma.user.update({
        where: { id: existing.id },
        data: { pbxExtension: extension },
      });
      byExtension.set(extension, existing.id);
      continue;
    }

    const created = await prisma.user.create({
      data: {
        login,
        fullName,
        passwordHash: "!", // вход создаётся только самим сотрудником
        role: "OPERATOR",
        branchId,
        pbxExtension: extension,
        isActive: user.enabled !== false,
      },
      select: { id: true },
    });
    byExtension.set(extension, created.id);
  }

  return byExtension;
}

// ------------------------------------------------------------- синхронизация

export type PbxResult = {
  pbxCalls: number;
  pbxOperators: number;
  pbxSince: Date;
};

const chunk = <T>(rows: T[], size: number) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size)
  );

/** Перезаписывает звонки за последние `days` суток данными из АТС. */
export async function refreshPbxCalls(days = 3): Promise<PbxResult> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: APP.branch.id } });
  const byExtension = await syncOperators(branch.id);
  const known = new Set(byExtension.keys());

  const calls = await fetchPbxCalls(since, new Date());

  // Звонок привязывается к лиду по номеру телефона: у оператора в карточке
  // видно, с кем он говорил, а не только голый номер.
  const leads = await prisma.lead.findMany({
    where: { branchId: branch.id },
    select: { id: true, phone: true },
    orderBy: { createdAt: "desc" },
  });
  const leadByPhone = new Map<string, string>();
  for (const lead of leads) {
    const tail = phoneTail(lead.phone);
    if (tail && !leadByPhone.has(tail)) leadByPhone.set(tail, lead.id);
  }

  const rows = calls
    .map((call) => {
      const facts = classifyCall(call, known);
      const operatorId = facts && byExtension.get(facts.extension);
      if (!facts || !operatorId) return null;

      return {
        branchId: branch.id,
        externalId: call.uuid,
        operatorId,
        leadId: leadByPhone.get(phoneTail(facts.phone) ?? "") ?? null,
        phone: facts.phone,
        type: facts.incoming ? "INCOMING" : "OUTGOING",
        result: facts.result,
        durationSeconds: facts.talkSeconds,
        isLesson: facts.isLesson,
        calledAt: facts.calledAt,
        note: "onlinePBX",
      };
    })
    .filter((row) => row != null);

  // Окно перезаписываем целиком: у звонка может смениться длительность,
  // если запись догрузилась уже после предыдущей синхронизации.
  await prisma.callLog.deleteMany({ where: { branchId: branch.id, calledAt: { gte: since } } });
  for (const part of chunk(rows, 1000)) {
    await prisma.callLog.createMany({ data: part as never, skipDuplicates: true });
  }

  return { pbxCalls: rows.length, pbxOperators: byExtension.size, pbxSince: since };
}
