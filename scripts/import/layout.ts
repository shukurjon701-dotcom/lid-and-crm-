/**
 * Определение структуры листа.
 *
 * В рабочей таблице центра колонки от месяца к месяцу разъезжаются: где-то есть
 * строка заголовков, где-то нет, в апреле всё сдвинуто на колонку влево.
 * Поэтому колонки определяются по содержимому, а не по букве.
 *
 * Опора — колонка с телефонами: она узнаётся однозначно (9 цифр), а имя всегда
 * стоит слева от неё, группа — справа. Дальше классифицируем остальные колонки.
 */
import { cell, normalizePhone, type Cell } from "./xlsx";
import { toDate, toNumber } from "./csv";

export type Layout = {
  name: string;
  phone: string;
  group: string | null;
  teacher: string | null;
  seller: string | null;
  amount: string | null;
  method: string | null;
  date: string | null;
  trial: string | null;
  marks: string | null;
  comment: string | null;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const shift = (letter: string, by: number): string | null => {
  const i = LETTERS.indexOf(letter);
  const j = i + by;
  return j >= 0 && j < LETTERS.length ? LETTERS[j] : null;
};

const METHOD_RE = /click|naqd|uzcard|humo|terminal|karta|kart\b|payme|plastik|o'tkaz|otkaz/i;
const TRIAL_RE = /probniy|sinov/i;
const MARKS_RE = /\d\s*-?\s*dars|qoldi|qolmadi|keldi|kemadi|kelmadi/i;
/** Слова, которые встречаются ТОЛЬКО в шапке, целой ячейкой. */
const HEADER_TOKENS = [
  /^ism/i, /familya|familiya/i, /^tel/i, /raqam/i, /^guruh$/i, /^kurs$/i,
  /sotuvchi/i, /qituvchi|^ustoz$/i, /^modmee$/i, /^comment$/i, /probniy/i,
  /qoldi|qolmadi/i, /kutvoldi/i, /^to.?lov$/i, /^summa$/i, /^narx$/i,
];

/**
 * Строка похожа на шапку, а не на данные.
 * Требуем три совпадения ЦЕЛЫМИ ячейками и отсутствие телефонов —
 * иначе комментарий вроде «90.000 kitob kursga» сойдёт за заголовок.
 */
export function looksLikeHeader(row: Record<string, Cell>): boolean {
  const values = Object.values(row).map((c) => c.value).filter(Boolean);
  if (values.length < 3) return false;
  if (values.some((v) => isPhone(v))) return false;
  if (values.some((v) => v.length > 30)) return false;
  const hits = values.filter((v) => HEADER_TOKENS.some((re) => re.test(v))).length;
  return hits >= 3;
}

const isPhone = (raw: string): boolean => {
  if (!raw) return false;
  const digits = normalizePhone(raw).replace(/\D/g, "");
  return digits.length >= 11 && digits.length <= 13;
};

const isPersonName = (raw: string): boolean =>
  raw.length >= 4 && /\p{L}{3,}/u.test(raw) && !/\d{4,}/.test(raw) && !METHOD_RE.test(raw);

const isAmount = (raw: string): boolean => {
  const n = toNumber(raw);
  return n >= 50_000 && n <= 20_000_000;
};

const isDateLike = (raw: string): boolean => {
  if (/^\d{4,5}(\.\d+)?$/.test(raw.trim())) {
    const n = Number(raw);
    return n > 44_000 && n < 48_000; // серийные даты Excel: 2020–2031
  }
  return /^\s*\d{1,2}[.\/-]\d{1,2}/.test(raw);
};

const share = (rows: Record<string, Cell>[], letter: string, test: (v: string) => boolean) => {
  let filled = 0;
  let hits = 0;
  for (const row of rows) {
    const value = cell(row, letter);
    if (!value) continue;
    filled++;
    if (test(value)) hits++;
  }
  return filled < 3 ? 0 : hits / filled;
};

/**
 * Словари, набранные с листов, где заголовки есть, — по ним потом
 * узнаём преподавателя и продавца там, где заголовков нет.
 */
export type Vocabulary = { teachers: Set<string>; sellers: Set<string>; groups: Set<string> };

export const emptyVocabulary = (): Vocabulary => ({
  teachers: new Set(),
  sellers: new Set(),
  groups: new Set(),
});

const norm = (value: string) => value.toLowerCase().trim();

/** Разбор листа по строке заголовков, если она есть. */
export function layoutFromHeader(row: Record<string, Cell>): Partial<Layout> {
  const layout: Partial<Layout> = {};
  for (const [letter, { value }] of Object.entries(row)) {
    const v = norm(value);
    if (!v || v.length > 30) continue;
    if (/^ism|familya|familiya/.test(v)) layout.name = letter;
    else if (/^tel|raqam/.test(v)) layout.phone = letter;
    else if (/^guruh$|^kurs$/.test(v)) layout.group = letter;
    else if (/qituvchi|^ustoz$/.test(v)) layout.teacher = letter;
    else if (/sotuvchi/.test(v)) layout.seller = letter;
    else if (/^to.?lov$/.test(v)) layout.method = letter;
    else if (/probniy|sinov/.test(v)) layout.trial = letter;
    else if (/qoldi|qolmadi|kutvoldi/.test(v)) layout.marks = letter;
    else if (/^comment$|^izoh$/.test(v)) layout.comment = letter;
    else if (/^summa$|^narx$|^pul$/.test(v)) layout.amount = letter;
  }
  return layout;
}

/**
 * Определение структуры по данным. `hint` — то, что удалось понять из заголовка.
 */
export function detectLayout(
  rows: Record<string, Cell>[],
  vocabulary: Vocabulary,
  hint: Partial<Layout> = {}
): Layout | null {
  const sample = rows.filter((r) => Object.keys(r).length > 2).slice(0, 200);
  if (sample.length === 0) return null;

  const used = new Set<string>();
  const take = (letter: string | null | undefined) => {
    if (letter) used.add(letter);
    return letter ?? null;
  };

  // 1. Телефон — самая надёжная опора
  let phone = hint.phone ?? null;
  if (!phone || share(sample, phone, isPhone) < 0.3) {
    let best = { letter: "", score: 0 };
    for (const letter of LETTERS.slice(0, 16)) {
      const score = share(sample, letter, isPhone);
      if (score > best.score) best = { letter, score };
    }
    phone = best.score >= 0.35 ? best.letter : null;
  }
  if (!phone) return null;
  take(phone);

  // 2. Имя слева от телефона, группа справа
  const name = hint.name && share(sample, hint.name, isPersonName) > 0.5
    ? hint.name
    : (() => {
        const left = shift(phone, -1);
        return left && share(sample, left, isPersonName) > 0.4 ? left : null;
      })();
  if (!name) return null;
  take(name);

  const groupCandidate = hint.group ?? shift(phone, 1);
  const group =
    groupCandidate && share(sample, groupCandidate, (v) => /\p{L}{3,}/u.test(v)) > 0.4
      ? groupCandidate
      : null;
  take(group);

  // 3. Остальные колонки — по содержимому
  const rest = LETTERS.slice(0, 18).filter((l) => !used.has(l));
  const scored = rest.map((letter) => ({
    letter,
    amount: share(sample, letter, isAmount),
    method: share(sample, letter, (v) => METHOD_RE.test(v)),
    date: share(sample, letter, isDateLike),
    trial: share(sample, letter, (v) => TRIAL_RE.test(v)),
    marks: share(sample, letter, (v) => MARKS_RE.test(v)),
    person: share(sample, letter, isPersonName),
    seller: share(sample, letter, (v) => vocabulary.sellers.has(norm(v))),
    teacher: share(sample, letter, (v) => vocabulary.teachers.has(norm(v))),
    text: share(sample, letter, (v) => v.length > 0),
  }));

  // Колонка с суммами не должна оказаться колонкой дат или телефонов
  for (const s of scored) {
    if (s.date > 0.3 || share(sample, s.letter, isPhone) > 0.2) s.amount = 0;
    if (s.date > 0.2) s.person = 0;
  }

  const pickBest = (field: keyof (typeof scored)[0], min: number): string | null => {
    let best: { letter: string; score: number } | null = null;
    for (const s of scored) {
      if (used.has(s.letter)) continue;
      const score = s[field] as number;
      if (score >= min && (!best || score > best.score)) best = { letter: s.letter, score };
    }
    return best ? take(best.letter) : null;
  };

  const method = take(hint.method) ?? pickBest("method", 0.25);
  const trial = take(hint.trial) ?? pickBest("trial", 0.2);
  // Из нескольких денежных колонок берём самую левую — это основная оплата,
  // правее обычно идут доплаты следующих месяцев.
  const amount =
    take(hint.amount) ??
    (() => {
      const candidate = scored.find((s) => !used.has(s.letter) && s.amount >= 0.35);
      return candidate ? take(candidate.letter) : null;
    })();
  const date = take(hint.date) ?? pickBest("date", 0.35);
  const marks = take(hint.marks) ?? pickBest("marks", 0.12);

  // Преподаватель — сразу за группой; продавец — по словарю
  const teacherCandidate = hint.teacher ?? (group ? shift(group, 1) : null);
  const teacher =
    teacherCandidate && !used.has(teacherCandidate) &&
    share(sample, teacherCandidate, isPersonName) > 0.4
      ? take(teacherCandidate)
      : pickBest("teacher", 0.25);

  const seller =
    take(hint.seller) ??
    pickBest("seller", 0.2) ??
    (() => {
      // запасной вариант: короткие имена людей, не даты и не комментарии
      const candidate = scored
        .filter((s) => !used.has(s.letter) && s.person >= 0.5 && s.date < 0.15)
        .filter((s) => share(sample, s.letter, (v) => v.length <= 24) > 0.85)
        .sort((a, b) => b.person - a.person)[0];
      return candidate ? take(candidate.letter) : null;
    })();
  const comment = take(hint.comment) ?? pickBest("text", 0.3);

  return { name, phone, group, teacher, seller, amount, method, date, trial, marks, comment };
}

/** Пополнить словари значениями из листа с известной структурой. */
export function learnVocabulary(
  rows: Record<string, Cell>[],
  layout: Partial<Layout>,
  vocabulary: Vocabulary
) {
  const collect = (letter: string | null | undefined, target: Set<string>) => {
    if (!letter) return;
    for (const row of rows) {
      const value = cell(row, letter);
      if (value && isPersonName(value) && value.length < 30) target.add(norm(value));
    }
  };
  collect(layout.teacher, vocabulary.teachers);
  collect(layout.seller, vocabulary.sellers);
  if (layout.group) {
    for (const row of rows) {
      const value = cell(row, layout.group);
      if (value) vocabulary.groups.add(norm(value));
    }
  }
}

export { isPersonName, isPhone, isAmount, isDateLike, toDate };
