/**
 * A transaction's change history: what changed, from what to what, by whom
 * and when. Only the fields people read are tracked; ids (category, account,
 * project) are kept as ids and named when shown.
 */
export const TRACKED_FIELDS = [
  "type",
  "amountMinor",
  "currency",
  "date",
  "categoryId",
  "accountId",
  "toAccountId",
  "note",
  "merchant",
  "tags",
  "projectId",
  "clearing",
  "splits",
  "upiRef",
  "upiId",
  "gst",
] as const;
export type TrackedField = (typeof TRACKED_FIELDS)[number];

export const FIELD_LABEL: Record<TrackedField, string> = {
  type: "Type",
  amountMinor: "Amount",
  currency: "Currency",
  date: "Date",
  categoryId: "Category",
  accountId: "Account",
  toAccountId: "To account",
  note: "Note",
  merchant: "Merchant",
  tags: "Tags",
  projectId: "Project",
  clearing: "Status",
  splits: "Split",
  upiRef: "UPI reference",
  upiId: "UPI ID",
  gst: "GST",
};

export const HISTORY_ACTIONS = ["created", "updated", "deleted", "attachment_added", "attachment_removed"] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export type SnapshotValue = string | number | null;
export type Snapshot = Partial<Record<TrackedField, SnapshotValue>>;
export type FieldChange = { field: TrackedField; from: SnapshotValue; to: SnapshotValue };

/** The fields that differ between two snapshots, in the order fields are listed. */
export function diffSnapshots(before: Snapshot, after: Snapshot): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of TRACKED_FIELDS) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

/**
 * A snapshot of the tracked fields; lists become one comparable string
 * (tags in their order, split lines as "category:amount").
 */
export function snapshotOf(t: {
  type: string;
  amountMinor: number;
  currency: string;
  date: string;
  categoryId: string | null;
  accountId: string | null;
  toAccountId?: string | null;
  note: string | null;
  merchant?: string | null;
  tags?: string[];
  projectId?: string | null;
  clearing?: string | null;
  splits?: Array<{ categoryId: string | null; amountMinor: number }>;
  upiRef?: string | null;
  upiId?: string | null;
  gst?: { ratePct: number; treatment: string; supply: string; gstin?: string | null } | null;
}): Snapshot {
  return {
    type: t.type,
    amountMinor: t.amountMinor,
    currency: t.currency,
    date: t.date,
    categoryId: t.categoryId,
    accountId: t.accountId,
    toAccountId: t.toAccountId ?? null,
    note: t.note || null,
    merchant: t.merchant || null,
    tags: t.tags?.length ? t.tags.join(", ") : null,
    projectId: t.projectId ?? null,
    clearing: t.clearing ?? "cleared",
    splits: t.splits?.length ? t.splits.map((line) => `${line.categoryId ?? "none"}:${line.amountMinor}`).join(", ") : null,
    upiRef: t.upiRef ?? null,
    upiId: t.upiId ?? null,
    gst: t.gst ? `${t.gst.treatment === "taxable" ? `${t.gst.ratePct}%` : t.gst.treatment} ${t.gst.supply === "inter" ? "IGST" : "CGST+SGST"}${t.gst.gstin ? ` ${t.gst.gstin}` : ""}` : null,
  };
}

export const MAX_ATTACHMENTS = 10;
export const MAX_COMMENT_LENGTH = 2000;
