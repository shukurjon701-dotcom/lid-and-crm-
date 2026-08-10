/**
 * Разбор CSV, выгруженного из Excel / Google Sheets / Numbers,
 * и приведение «человеческих» значений к типам базы.
 * Без внешних зависимостей — чтобы импорт работал сразу.
 */

/** Определяет разделитель: Excel в русской локали пишет `;`, Google Sheets — `,`. */
function detectDelimiter(headerLine: string): string {
  const counts = [";", ",", "\t"].map((d) => ({
    d,
    n: headerLine.split(d).length - 1,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

/** Разбор с учётом кавычек и переносов строк внутри ячеек. */
export function parseCsv(raw: string): Record<string, string>[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return [];

  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

/** Приведение заголовка к ключу сравнения: регистр, пробелы и ё/e не важны. */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/['’`]/g, "")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

/**
 * Достаёт значение по любому из синонимов заголовка.
 * Порядок синонимов важен: первый найденный выигрывает.
 */
export function field(row: Record<string, string>, aliases: string[]): string {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeHeader(key), value);
  }
  for (const alias of aliases) {
    const value = normalized.get(normalizeHeader(alias));
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

/**
 * «450 000 сум», «1,200,000», «$300», «300.50» → число.
 * Пустая строка и мусор → 0.
 */
export function toNumber(raw: string): number {
  if (!raw) return 0;
  let s = raw
    .replace(/ /g, " ")
    .replace(/[^\d,.\-]/g, "")
    .trim();
  if (!s) return 0;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Последний разделитель — десятичный, остальные разрядные
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else if (hasComma) {
    // «1,200,000» — разрядные; «300,50» — десятичный
    const parts = s.split(",");
    const isThousands = parts.length > 2 || (parts[1] ?? "").length === 3;
    s = isThousands ? parts.join("") : parts.join(".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts[1] ?? "").length === 3) s = parts.join("");
  }

  const value = Number(s);
  return Number.isFinite(value) ? value : 0;
}

/**
 * «14.08.2025», «14/08/2025», «2025-08-14», «14.08» (текущий год)
 * и серийный номер даты Excel → Date. Пусто/мусор → null.
 */
export function toDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // Серийный номер Excel (дни с 30.12.1899)
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 60000) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    }
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = s.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    let year = dmy[3] ? Number(dmy[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    return Number.isNaN(+date) ? null : date;
  }

  const parsed = new Date(s);
  return Number.isNaN(+parsed) ? null : parsed;
}

/** «ha», «да», «+», «1», «true», «sifatli» → true */
export function toBool(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  return ["1", "+", "да", "ha", "yes", "true", "bor", "ok", "v", "✓", "sifatli"].includes(s);
}

/** Ищет по подстрокам: первое совпадение выигрывает. */
function match<T>(raw: string, table: [string[], T][], fallback: T): T {
  const s = raw.toLowerCase().replace(/ё/g, "е");
  if (!s) return fallback;
  for (const [keys, value] of table) {
    if (keys.some((k) => s.includes(k))) return value;
  }
  return fallback;
}

export const toStudentStatus = (raw: string) =>
  match<"ACTIVE" | "FROZEN" | "LEFT" | "GRADUATED">(
    raw,
    [
      [["муз", "muz", "заморож", "freeze", "frozen", "pauza"], "FROZEN"],
      [["ketgan", "ket", "ушел", "ушёл", "left", "otchisl", "числ", "tashlab"], "LEFT"],
      [["bitir", "выпуск", "graduat", "tugat"], "GRADUATED"],
      [["faol", "актив", "active", "o'qiydi", "oqiydi", "ha"], "ACTIVE"],
    ],
    "ACTIVE"
  );

export const toPaymentMethod = (raw: string) =>
  match<"CASH" | "CARD" | "TERMINAL" | "TRANSFER">(
    raw,
    [
      [["terminal", "терминал", "pos"], "TERMINAL"],
      [["naqd", "нал", "cash", "qo'lda", "qolda"], "CASH"],
      [["click", "payme", "перевод", "o'tkaz", "otkaz", "transfer", "bank", "uzum"], "TRANSFER"],
      [["kart", "карт", "card", "plastik", "humo", "uzcard"], "CARD"],
    ],
    "CASH"
  );

export const toLeadSource = (raw: string) =>
  match<
    | "INSTAGRAM" | "TELEGRAM" | "FACEBOOK" | "TIKTOK" | "WEBSITE"
    | "REFERRAL" | "WALK_IN" | "INBOUND_CALL" | "OTHER"
  >(
    raw,
    [
      [["insta", "инст"], "INSTAGRAM"],
      [["telegram", "телег", "tg"], "TELEGRAM"],
      [["facebook", "фейс", "fb"], "FACEBOOK"],
      [["tiktok", "тикток"], "TIKTOK"],
      [["sayt", "сайт", "site", "web"], "WEBSITE"],
      [["tanish", "sarafan", "сараф", "рекоменд", "referral", "do'st", "dost"], "REFERRAL"],
      [["ozi keldi", "o'zi keldi", "пришел", "пришёл", "walk", "офис", "ofis"], "WALK_IN"],
      [["qo'ng'iroq", "qongiroq", "звонок", "call"], "INBOUND_CALL"],
    ],
    "OTHER"
  );

export const toLeadStatus = (raw: string) =>
  match<
    | "NEW" | "IN_PROGRESS" | "NO_ANSWER" | "VISIT_PLANNED"
    | "VISITED" | "CONVERTED" | "REJECTED" | "LOST"
  >(
    raw,
    [
      [["o'quvchi", "oquvchi", "student", "ученик", "sotildi", "продан", "convert"], "CONVERTED"],
      [["keldi", "пришел", "пришёл", "visited", "tashrif"], "VISITED"],
      [["yozildi", "записан", "planned", "kelishi"], "VISIT_PLANNED"],
      [["javob yo'q", "javob yoq", "не отвеч", "недозвон", "no answer"], "NO_ANSWER"],
      [["rad", "отказ", "reject"], "REJECTED"],
      [["yo'qol", "потерян", "lost"], "LOST"],
      [["ishlanmoqda", "в работе", "progress"], "IN_PROGRESS"],
      [["yangi", "новый", "new"], "NEW"],
    ],
    "NEW"
  );

export const toSaleChannel = (raw: string) =>
  match<"ONLINE" | "OFFLINE">(raw, [[["onlayn", "online", "онлайн", "masofaviy"], "ONLINE"]], "OFFLINE");
