/**
 * Just enough of MIME (RFC 5322, 2045–2047, 2231) to read a forwarded
 * receipt or bill: who sent it and to whom, its subject and date, its text,
 * and its attachments as bytes. Messages forwarded as attachments
 * (message/rfc822) are read into, so their files count too.
 *
 * Works on the raw message as a "binary string" (one char per byte), so it
 * needs nothing from Node.
 */

export type MailAddress = { name: string | null; address: string };
export type MailAttachment = { name: string; contentType: string; bytes: Uint8Array };
export type ParsedMail = {
  from: MailAddress | null;
  /** To, Cc and the delivery headers relays add, lowercased. */
  recipients: string[];
  subject: string;
  /** The Date header as YYYY-MM-DD (UTC), if it reads. */
  date: string | null;
  messageId: string | null;
  /** Plain text, or the HTML part with its tags taken out. */
  text: string;
  attachments: MailAttachment[];
};

type Headers = Map<string, string[]>;

/** One char per byte, from bytes. */
export function binaryString(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

function bytesOf(binary: string) {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

function decodeCharset(bytes: Uint8Array, charset: string | undefined) {
  const label = (charset ?? "utf-8").trim().toLowerCase();
  try {
    return new TextDecoder(label === "us-ascii" ? "utf-8" : label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function splitHead(raw: string) {
  const crlf = raw.indexOf("\r\n\r\n");
  const lf = raw.indexOf("\n\n");
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { head: raw.slice(0, crlf), body: raw.slice(crlf + 4) };
  if (lf !== -1) return { head: raw.slice(0, lf), body: raw.slice(lf + 2) };
  return { head: raw, body: "" };
}

export function parseHeaders(head: string): Headers {
  const headers: Headers = new Map();
  // Folded lines carry on the one before.
  const lines = head.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ").split("\n");
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    headers.set(name, [...(headers.get(name) ?? []), line.slice(colon + 1).trim()]);
  }
  return headers;
}

const first = (headers: Headers, name: string) => headers.get(name)?.[0] ?? null;

function base64Bytes(text: string) {
  const clean = text.replace(/[^A-Za-z0-9+/=]/g, "");
  try {
    return bytesOf(atob(clean.slice(0, clean.length - (clean.length % 4))));
  } catch {
    return new Uint8Array();
  }
}

function quotedPrintableBytes(text: string, header = false) {
  const soft = text.replace(/=\r?\n/g, "");
  const decoded = (header ? soft.replace(/_/g, " ") : soft).replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return bytesOf(decoded);
}

/** RFC 2047 encoded words: =?charset?B|Q?text?= (spaces between two of them don't count). */
export function decodeWords(value: string) {
  const raw = value.replace(/(=\?[^?]+\?[bqBQ]\?[^?]*\?=)\s+(?==\?)/g, "$1");
  return raw.replace(/=\?([^?*]+)(?:\*[^?]+)?\?([bqBQ])\?([^?]*)\?=/g, (_, charset: string, encoding: string, text: string) =>
    decodeCharset(encoding.toUpperCase() === "B" ? base64Bytes(text) : quotedPrintableBytes(text, true), charset),
  );
}

/** A header's main value and its parameters, with RFC 2231 (name*=utf-8''…, name*0=…) read. */
export function headerParams(value: string | null): { value: string; params: Record<string, string> } {
  if (!value) return { value: "", params: {} };
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === ";" && !quoted) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  const params: Record<string, string> = {};
  const continued: Record<string, Array<{ n: number; text: string; encoded: boolean }>> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    let val = part.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, "$1");
    const piece = /^([^*]+)\*(\d+)?(\*)?$/.exec(key);
    if (piece) (continued[piece[1]!] ??= []).push({ n: Number(piece[2] ?? 0), text: val, encoded: Boolean(piece[3]) || (!piece[2] && key.endsWith("*")) });
    else params[key] = decodeWords(val);
  }
  for (const [key, pieces] of Object.entries(continued)) {
    pieces.sort((a, b) => a.n - b.n);
    let charset = "utf-8";
    const text = pieces
      .map((p, i) => {
        if (!p.encoded) return p.text;
        let t = p.text;
        if (i === 0) {
          const m = /^([^']*)'[^']*'(.*)$/.exec(t);
          if (m) {
            charset = m[1] || charset;
            t = m[2]!;
          }
        }
        return t.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      })
      .join("");
    params[key] = decodeCharset(bytesOf(text), charset);
  }
  return { value: parts[0]!.trim().toLowerCase(), params };
}

/** "Name" <a@b>, a@b, Name <a@b> — split on commas outside quotes and brackets. */
export function parseAddresses(value: string | null): MailAddress[] {
  if (!value) return [];
  const out: MailAddress[] = [];
  let current = "";
  let quoted = false;
  let angle = false;
  const flush = () => {
    const text = decodeWords(current.trim());
    current = "";
    if (!text) return;
    const m = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(text);
    if (m) out.push({ name: m[1]!.trim().replace(/^"|"$/g, "").trim() || null, address: m[2]!.toLowerCase() });
    else if (/^[^\s@]+@[^\s@]+$/.test(text)) out.push({ name: null, address: text.toLowerCase() });
  };
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    else if (char === "<" && !quoted) angle = true;
    else if (char === ">" && !quoted) angle = false;
    if (char === "," && !quoted && !angle) flush();
    else current += char;
  }
  flush();
  return out;
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const EXTENSION_TYPE: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

type Collected = { plain: string[]; html: string[]; attachments: MailAttachment[] };

function walk(raw: string, collected: Collected, depth: number) {
  if (depth > 8) return;
  const { head, body } = splitHead(raw);
  const headers = parseHeaders(head);
  const type = headerParams(first(headers, "content-type") ?? "text/plain");
  const disposition = headerParams(first(headers, "content-disposition"));
  const encoding = (first(headers, "content-transfer-encoding") ?? "7bit").toLowerCase();

  if (type.value.startsWith("multipart/") && type.params.boundary) {
    const boundary = `--${type.params.boundary}`;
    const sections = body.split(new RegExp(`\\r?\\n?${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*\\r?\\n?`));
    // The first section is the preamble and the last the epilogue.
    for (const section of sections.slice(1, -1)) walk(section, collected, depth + 1);
    return;
  }
  if (type.value === "message/rfc822") {
    walk(encoding === "base64" ? binaryString(base64Bytes(body)) : body, collected, depth + 1);
    return;
  }
  const bytes = encoding === "base64" ? base64Bytes(body) : encoding === "quoted-printable" ? quotedPrintableBytes(body) : bytesOf(body);
  const name = disposition.params.filename ?? type.params.name ?? null;
  if (disposition.value === "attachment" || name || (!type.value.startsWith("text/") && !type.value.startsWith("multipart/"))) {
    const extension = name?.split(".").pop()?.toLowerCase() ?? "";
    const contentType = type.value === "application/octet-stream" || !type.value ? (EXTENSION_TYPE[extension] ?? type.value) : type.value;
    collected.attachments.push({ name: name ?? `attachment.${Object.entries(EXTENSION_TYPE).find(([, t]) => t === contentType)?.[0] ?? "bin"}`, contentType, bytes });
    return;
  }
  const text = decodeCharset(bytes, type.params.charset);
  if (type.value === "text/html") collected.html.push(text);
  else collected.plain.push(text);
}

function isoDay(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value.replace(/\s*\([^)]*\)\s*$/, ""));
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

export function parseMail(raw: string): ParsedMail {
  const { head } = splitHead(raw);
  const headers = parseHeaders(head);
  const collected: Collected = { plain: [], html: [], attachments: [] };
  walk(raw, collected, 0);
  const recipients = ["to", "cc", "delivered-to", "x-original-to", "x-forwarded-to", "envelope-to"]
    .flatMap((h) => (headers.get(h) ?? []).flatMap((v) => parseAddresses(v)))
    .map((a) => a.address);
  return {
    from: parseAddresses(first(headers, "from"))[0] ?? null,
    recipients: [...new Set(recipients)],
    subject: decodeWords(first(headers, "subject") ?? "").trim(),
    date: isoDay(first(headers, "date")),
    messageId: first(headers, "message-id")?.replace(/^<|>$/g, "") ?? null,
    text: (collected.plain.length ? collected.plain.join("\n") : htmlToText(collected.html.join("\n"))).trim(),
    attachments: collected.attachments,
  };
}
