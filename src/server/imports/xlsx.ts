import { inflateRawSync } from "node:zlib";

/**
 * Reads the first sheet of an .xlsx workbook into rows of text cells, with
 * nothing but Node's zlib: an .xlsx is a zip of XML files. Dates stay as the
 * spreadsheet's day numbers (the import reads those). Formulas give their
 * cached values.
 */

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number };

function zipEntries(buffer: Buffer): ZipEntry[] {
  // The end-of-central-directory record is in the last 64 KB.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("That isn't an .xlsx file");
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error("That .xlsx file looks damaged");
    const method = buffer.readUInt16LE(pos + 10);
    const compressedSize = buffer.readUInt32LE(pos + 20);
    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const offset = buffer.readUInt32LE(pos + 42);
    entries.push({ name: buffer.toString("utf8", pos + 46, pos + 46 + nameLength), method, compressedSize, offset });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): string {
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error("That .xlsx file uses compression this can't read");
}

function decode(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** All the text in an element's <t> pieces (shared strings can be rich text in several runs). */
function texts(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!)).join("");
}

function columnIndex(ref: string) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

export function readXlsx(buffer: Buffer): string[][] {
  const entries = zipEntries(buffer);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const shared = byName.get("xl/sharedStrings.xml");
  const strings = shared ? [...readEntry(buffer, shared).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!)) : [];
  // The first sheet in the workbook's order, falling back to sheet1.
  const workbook = byName.get("xl/workbook.xml");
  const rels = byName.get("xl/_rels/workbook.xml.rels");
  let sheetPath = "xl/worksheets/sheet1.xml";
  if (workbook && rels) {
    const firstId = /<sheet\b[^>]*r:id="([^"]+)"/.exec(readEntry(buffer, workbook))?.[1];
    const target = firstId ? new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`).exec(readEntry(buffer, rels))?.[1] : undefined;
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  }
  const sheet = byName.get(sheetPath) ?? entries.find((e) => e.name.startsWith("xl/worksheets/sheet"));
  if (!sheet) throw new Error("That workbook has no sheets");
  const rows: string[][] = [];
  for (const rowMatch of readEntry(buffer, sheet).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]!;
      const body = cell[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = strings[Number(raw)] ?? "";
      else if (type === "inlineStr") value = texts(body);
      else if (raw != null) value = decode(raw);
      const index = ref ? columnIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value.trim();
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}
