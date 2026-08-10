/**
 * Чтение .xlsx без внешних библиотек: ZIP + разбор XML.
 *
 * Отдельно от обычного CSV-импорта нужен потому, что в таблице центра
 * статус ученика закодирован ЦВЕТОМ ячейки (лист «Ranglar»), а CSV цвета теряет.
 */
import { inflateRawSync } from "node:zlib";

// ------------------------------------------------------------------ ZIP
function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  // End of Central Directory — ищем сигнатуру с конца
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66_000; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Файл не похож на .xlsx (не найден конец ZIP-архива)");

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    files.set(name, method === 0 ? data : inflateRawSync(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

// ------------------------------------------------------------------ XML
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Буква колонки → номер: A=1, B=2, AA=27 */
export function columnNumber(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export type Cell = {
  /** Текст ячейки как есть */
  value: string;
  /** Цвет заливки: "FF00FF00" или "none" */
  color: string;
};

export type Sheet = {
  name: string;
  /** rows[индекс строки][буква колонки] */
  rows: Record<string, Cell>[];
};

export function readXlsx(buffer: Buffer): Sheet[] {
  const files = unzip(buffer);
  const text = (path: string) => files.get(path)?.toString("utf8") ?? "";

  // --- общие строки
  const shared: string[] = [];
  for (const si of text("xl/sharedStrings.xml").split("<si>").slice(1)) {
    const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
    shared.push(decodeEntities(parts.join("")));
  }

  // --- заливки: индекс стиля → цвет
  const styles = text("xl/styles.xml");
  const fills: string[] = [];
  const fillsBlock = styles.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)?.[1] ?? "";
  for (const fill of fillsBlock.split("<fill>").slice(1)) {
    const rgb = fill.match(/<fgColor[^>]*\srgb="([0-9A-Fa-f]{6,8})"/)?.[1];
    fills.push(rgb ? rgb.toUpperCase() : "none");
  }
  const cellXfs: number[] = [];
  const xfsBlock = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  for (const xf of xfsBlock.match(/<xf\b[^>]*\/?>/g) ?? []) {
    cellXfs.push(Number(attr(xf, "fillId") ?? 0));
  }
  const colorOf = (styleIndex: string | null): string => {
    if (styleIndex == null) return "none";
    const fillId = cellXfs[Number(styleIndex)];
    return fills[fillId] ?? "none";
  };

  // --- имена листов в порядке книги
  const workbook = text("xl/workbook.xml");
  const relsXml = text("xl/_rels/workbook.xml.rels");
  const relTargets = new Map<string, string>();
  for (const rel of relsXml.match(/<Relationship\b[^>]*\/?>/g) ?? []) {
    const id = attr(rel, "Id");
    const target = attr(rel, "Target");
    if (id && target) relTargets.set(id, target.replace(/^\/?xl\//, ""));
  }

  const sheets: Sheet[] = [];
  for (const tag of workbook.match(/<sheet\b[^>]*\/?>/g) ?? []) {
    const name = decodeEntities(attr(tag, "name") ?? "");
    const rid = attr(tag, "r:id") ?? attr(tag, "id");
    const target = rid ? relTargets.get(rid) : null;
    if (!target) continue;

    const xml = text(`xl/${target}`);
    const rows: Record<string, Cell>[] = [];

    for (const rowXml of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
      const row: Record<string, Cell> = {};
      for (const cellXml of rowXml.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = attr(cellXml, "r");
        if (!ref) continue;
        const letter = ref.replace(/[^A-Z]/gi, "").toUpperCase();
        const type = attr(cellXml, "t");
        const style = attr(cellXml, "s");

        let value = "";
        const inline = cellXml.match(/<is>([\s\S]*?)<\/is>/)?.[1];
        if (inline) {
          value = decodeEntities(
            [...inline.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")
          );
        } else {
          const raw = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1];
          if (raw != null) {
            value = type === "s" ? (shared[Number(raw)] ?? "") : decodeEntities(raw);
          }
        }

        row[letter] = { value: value.trim(), color: colorOf(style) };
      }
      rows.push(row);
    }

    sheets.push({ name, rows });
  }

  return sheets;
}

/** Значение ячейки или "" */
export const cell = (row: Record<string, Cell>, letter: string): string =>
  row[letter]?.value ?? "";

/** Цвет строки: берём первую непустую заливку среди указанных колонок. */
export function rowColor(row: Record<string, Cell>, letters: string[]): string {
  for (const letter of letters) {
    const color = row[letter]?.color;
    if (color && color !== "none") return color;
  }
  return "none";
}

/**
 * Google Sheets отдаёт длинные числа в научной записи: 5.04777509E8.
 * Приводим к узбекскому номеру: +998 50 477 75 09.
 */
export function normalizePhone(raw: string): string {
  const s = raw.trim();
  if (!s) return "";

  let digits: string;
  if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) {
    digits = String(Math.round(Number(s)));
  } else {
    digits = s.replace(/\D/g, "");
  }
  if (!digits) return s;

  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("9998")) return `+${digits.slice(1)}`;
  return `+${digits}`;
}
