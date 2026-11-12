/**
 * The audit history: every change to a workspace's money (transactions,
 * budgets, approvals, bills paid, goal and pool contributions, members) as
 * an entry that's never changed or removed. Each entry carries the hash of
 * the one before it, so an entry edited, removed or slipped in later, even
 * straight in the database, breaks the chain and shows up when it's checked.
 */

export const AUDIT_ENTITIES = ["transaction", "budget", "approval", "payment", "goal", "pool", "member", "account", "workspace"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ENTITY_LABEL: Record<AuditEntity, string> = {
  transaction: "Transactions",
  budget: "Budgets",
  approval: "Approvals",
  payment: "Bills paid",
  goal: "Goals",
  pool: "Pool contributions",
  member: "Members",
  account: "Accounts",
  workspace: "Workspace and data",
};

/** The hash before a workspace's first entry. */
export const GENESIS_HASH = "0".repeat(64);

/** What's hashed: everything an entry says, in a fixed order. */
export type AuditFields = {
  workspaceId: string;
  seq: number;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: AuditEntity;
  entityId: string | null;
  summary: string;
  data: unknown;
};

/** JSON with object keys sorted, so the same entry always reads the same. Dates as ISO strings; undefined left out. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // ObjectIds and the like read as their string.
    if (typeof (record as { toHexString?: unknown }).toHexString === "function") return JSON.stringify(String(value));
    const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return "null";
  return JSON.stringify(value);
}

/** The text an entry's hash is taken of: the previous hash, then the entry. */
export function hashInput(prevHash: string, fields: AuditFields) {
  return `${prevHash}\n${canonicalJson(fields)}`;
}

export type ChainEntry = AuditFields & { prevHash: string; hash: string };

export type ChainCheck =
  | { ok: true; entries: number; lastHash: string }
  | { ok: false; entries: number; brokenAt: number; reason: string };

/**
 * Walks a workspace's entries, oldest first, in pages (so a long history
 * isn't read at once): each must follow the last by one, point at its hash,
 * and hash to what it says.
 */
export class ChainChecker {
  private expectedSeq = 1;
  private prevHash = GENESIS_HASH;
  private count = 0;
  private failure: { brokenAt: number; reason: string } | null = null;

  constructor(private readonly hash: (text: string) => string) {}

  add(entry: ChainEntry) {
    if (this.failure) return;
    if (entry.seq !== this.expectedSeq) {
      this.failure = { brokenAt: this.expectedSeq, reason: entry.seq > this.expectedSeq ? `Entry ${this.expectedSeq} is missing` : `Entry ${entry.seq} appears twice` };
      return;
    }
    if (entry.prevHash !== this.prevHash) {
      this.failure = { brokenAt: entry.seq, reason: `Entry ${entry.seq} doesn't follow the one before it` };
      return;
    }
    const { prevHash, hash, ...fields } = entry;
    if (this.hash(hashInput(prevHash, fields)) !== hash) {
      this.failure = { brokenAt: entry.seq, reason: `Entry ${entry.seq} was changed after it was written` };
      return;
    }
    this.prevHash = hash;
    this.expectedSeq += 1;
    this.count += 1;
  }

  result(): ChainCheck {
    if (this.failure) return { ok: false, entries: this.count, ...this.failure };
    return { ok: true, entries: this.count, lastHash: this.prevHash };
  }
}

export type AuditEntryView = {
  seq: number;
  at: string;
  actorName: string | null;
  action: string;
  entity: AuditEntity;
  entityId: string | null;
  summary: string;
  data: unknown;
  hash: string;
};

/** "transaction.updated" → "Transaction updated". */
export function actionLabel(action: string) {
  const [entity, verb] = action.split(".");
  const text = `${entity ?? ""} ${(verb ?? "").replace(/_/g, " ")}`.trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : action;
}

/** The history as CSV, for an auditor. */
export function auditCsv(entries: AuditEntryView[]) {
  const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const rows = entries.map((e) => [String(e.seq), e.at, e.actorName ?? "Ledger", e.action, e.entity, e.entityId ?? "", e.summary, canonicalJson(e.data), e.hash].map(cell).join(","));
  return ["seq,at,actor,action,entity,entity_id,summary,data,hash", ...rows].join("\r\n") + "\r\n";
}
