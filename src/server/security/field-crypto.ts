import { createHash, createHmac } from "node:crypto";
import type { Schema } from "mongoose";
import { open, seal } from "@/src/server/security/secret-box";
import { noteTerms } from "@/src/core/sensitive";

/**
 * Sealed fields (src/core/sensitive.ts): the text is stored as "enc1:…"
 * (AES-256-GCM, src/server/security/secret-box.ts) and, where it's
 * searched, beside keyed hashes of its words' beginnings.
 */
const PREFIX = "enc1:";
/** What a note sealed under a key that's since changed reads as. */
export const UNREADABLE = "(can't be read: the encryption key changed)";

export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function sealField(plain: string): string;
export function sealField(plain: string | null | undefined): string | null;
export function sealField(plain: string | null | undefined) {
  if (plain == null || plain === "" || isSealed(plain)) return plain ?? null;
  return PREFIX + seal(plain);
}

export function openField(value: unknown): unknown {
  if (!isSealed(value)) return value;
  try {
    return open(value.slice(PREFIX.length));
  } catch {
    return UNREADABLE;
  }
}

function indexKey() {
  const source = process.env.LEDGER_SECRET_KEY || process.env.AUTH_SECRET;
  if (!source || source.length < 32) throw new Error("Set LEDGER_SECRET_KEY (or AUTH_SECRET) to at least 32 characters");
  return createHash("sha256").update(`ledger-blind-index:${source}`).digest();
}

/** A word beginning as stored for search: a keyed hash, so the word itself isn't. */
export function blindTerm(term: string) {
  return createHmac("sha256", indexKey()).update(term).digest("base64url").slice(0, 22);
}

export function blindTerms(text: string | null | undefined) {
  return noteTerms(text).map(blindTerm);
}

type Raw = Record<string, unknown>;

function openIn(target: unknown, path: string) {
  if (target && typeof target === "object" && path in (target as Raw)) (target as Raw)[path] = openField((target as Raw)[path]);
}

/**
 * Seals `path` on every way it's written (save, create, insertMany, and
 * $set in updates), and opens it on every way it's read (documents, lean
 * results, aggregates). With `termsPath`, keeps that field to the blind
 * terms of the text, for search. Queries that compare the text itself
 * (a regex on it) find nothing: search the terms instead.
 */
export function sealedText(schema: Schema, options: { path: string; termsPath?: string }) {
  const { path, termsPath } = options;

  // Read: the raw document is opened before it's made a document, so it holds the text, unmodified.
  schema.pre("init", function (raw: Raw) {
    openIn(raw, path);
  });
  for (const op of ["find", "findOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace"] as const) {
    schema.post(op, function (result: unknown) {
      if (!(this as { mongooseOptions(): { lean?: unknown } }).mongooseOptions().lean) return;
      for (const doc of Array.isArray(result) ? result : [result]) openIn(doc, path);
    });
  }
  schema.post("aggregate", function (result: unknown[]) {
    for (const row of result ?? []) openIn(row, path);
  });

  // Write: sealed just before it goes, then the document goes back to holding the text.
  schema.pre("save", function () {
    const doc = this as unknown as { isModified(p: string): boolean; get(p: string): unknown; set(p: string, v: unknown): void; $locals: Raw };
    if (!doc.isModified(path)) return;
    const plain = doc.get(path);
    if (typeof plain !== "string" || isSealed(plain)) return;
    doc.$locals[`sealed:${path}`] = plain;
    if (termsPath) doc.set(termsPath, blindTerms(plain));
    doc.set(path, sealField(plain));
  });
  schema.post("save", function () {
    const doc = this as unknown as { set(p: string, v: unknown): void; unmarkModified(p: string): void; $locals: Raw };
    const plain = doc.$locals[`sealed:${path}`];
    if (typeof plain !== "string") return;
    delete doc.$locals[`sealed:${path}`];
    doc.set(path, plain);
    doc.unmarkModified(path);
  });
  schema.pre("insertMany", function (_next: unknown, docs: unknown) {
    for (const doc of (Array.isArray(docs) ? docs : [docs]) as Raw[]) {
      const plain = typeof (doc as { get?: unknown }).get === "function" ? (doc as unknown as { get(p: string): unknown }).get(path) : doc[path];
      if (typeof plain !== "string" || isSealed(plain)) continue;
      const set = typeof (doc as { set?: unknown }).set === "function" ? (p: string, v: unknown) => (doc as unknown as { set(p: string, v: unknown): void }).set(p, v) : (p: string, v: unknown) => (doc[p] = v);
      if (termsPath) set(termsPath, blindTerms(plain));
      set(path, sealField(plain));
    }
  });
  schema.post("insertMany", function (docs: unknown) {
    for (const doc of (Array.isArray(docs) ? docs : []) as unknown[]) {
      const d = doc as { get?(p: string): unknown; set?(p: string, v: unknown): void; unmarkModified?(p: string): void };
      if (d.get && d.set) {
        const value = d.get(path);
        if (isSealed(value)) {
          d.set(path, openField(value));
          d.unmarkModified?.(path);
        }
      } else openIn(doc, path);
    }
  });
  for (const op of ["updateOne", "updateMany", "findOneAndUpdate"] as const) {
    schema.pre(op, function () {
      const query = this as unknown as { getUpdate(): Raw | null };
      const update = query.getUpdate();
      if (!update) return;
      for (const target of [update, update.$set as Raw | undefined]) {
        if (!target || !(path in target)) continue;
        const plain = target[path];
        if (typeof plain === "string" && !isSealed(plain)) {
          target[path] = sealField(plain);
          if (termsPath) target[termsPath] = blindTerms(plain);
        } else if (plain == null && termsPath) target[termsPath] = [];
      }
    });
  }
}
