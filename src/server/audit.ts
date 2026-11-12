import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { AuditEntry, LedgerUser, type AuditEntryDocument } from "@/src/server/models";
import { requireAction } from "@/src/server/workspace/members";
import { AUDIT_ENTITIES, canonicalJson, ChainChecker, GENESIS_HASH, hashInput, type AuditEntity, type AuditEntryView, type AuditFields, type ChainCheck, type ChainEntry } from "@/src/core/audit";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
/** Two writers racing for the same place in the chain: one wins, the other tries the next. */
const MAX_TRIES = 12;
const PAGE = 500;

function oid(id: string | Types.ObjectId) {
  if (!Types.ObjectId.isValid(String(id))) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(String(id));
}

function fieldsOf(doc: AuditEntryDocument): AuditFields {
  return {
    workspaceId: String(doc.workspaceId),
    seq: doc.seq,
    at: doc.at.toISOString(),
    actorId: doc.actorId ? String(doc.actorId) : null,
    actorName: doc.actorName ?? null,
    action: doc.action,
    entity: doc.entity as AuditEntity,
    entityId: doc.entityId ?? null,
    summary: doc.summary,
    data: doc.data ?? null,
  };
}

/**
 * Adds an entry to the end of a workspace's audit history. It runs after
 * the change it records has been made, so it never fails that change: a
 * write that can't get a place in the chain is logged loudly instead.
 */
export async function appendAudit(input: {
  workspaceId: Types.ObjectId | string;
  actorId: string | Types.ObjectId | null;
  action: string;
  entity: AuditEntity;
  entityId?: string | Types.ObjectId | null;
  summary: string;
  data?: unknown;
}) {
  try {
    await withDb(async () => {
      const workspaceId = oid(input.workspaceId);
      const actorId = input.actorId ? oid(input.actorId) : null;
      const actorName = actorId ? ((await LedgerUser.findById(actorId).select("displayName").lean())?.displayName ?? null) : null;
      // Stored as plain JSON, so it reads back exactly as it was hashed.
      const data = JSON.parse(canonicalJson(input.data ?? null)) as unknown;
      for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        const last = await AuditEntry.findOne({ workspaceId }).sort({ seq: -1 }).select("seq hash").lean();
        const prevHash = last?.hash ?? GENESIS_HASH;
        const fields: AuditFields = {
          workspaceId: String(workspaceId),
          seq: (last?.seq ?? 0) + 1,
          at: new Date().toISOString(),
          actorId: actorId ? String(actorId) : null,
          actorName,
          action: input.action,
          entity: input.entity,
          entityId: input.entityId ? String(input.entityId) : null,
          summary: input.summary.slice(0, 300),
          data,
        };
        try {
          await AuditEntry.create({ ...fields, workspaceId, actorId, at: new Date(fields.at), prevHash, hash: sha256(hashInput(prevHash, fields)) });
          return;
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
        }
      }
      throw new Error("No place in the audit chain after several tries");
    });
  } catch (error) {
    console.error(`Audit entry not written (${input.action} in ${String(input.workspaceId)}):`, error instanceof Error ? error.message : error);
  }
}

function view(doc: AuditEntryDocument): AuditEntryView {
  return {
    seq: doc.seq,
    at: doc.at.toISOString(),
    actorName: doc.actorName ?? null,
    action: doc.action,
    entity: doc.entity as AuditEntity,
    entityId: doc.entityId ?? null,
    summary: doc.summary,
    data: doc.data ?? null,
    hash: doc.hash,
  };
}

export type AuditQuery = { entity?: string; actorId?: string; entityId?: string; from?: string; to?: string; before?: number; limit?: number };

function filterOf(workspaceId: string, q: AuditQuery) {
  const filter: Record<string, unknown> = { workspaceId: oid(workspaceId) };
  if (q.entity) {
    if (!(AUDIT_ENTITIES as readonly string[]).includes(q.entity)) throw new ApiError(400, "invalid_request", "Unknown entity");
    filter.entity = q.entity;
  }
  if (q.actorId) filter.actorId = oid(q.actorId);
  if (q.entityId) filter.entityId = q.entityId;
  if (q.from || q.to) filter.at = { ...(q.from ? { $gte: new Date(`${q.from}T00:00:00.000Z`) } : {}), ...(q.to ? { $lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) };
  if (q.before) filter.seq = { $lt: q.before };
  return filter;
}

/** A page of the history, newest first, for those who may see it. */
export function listAudit(userId: string, workspaceId: string, q: AuditQuery = {}) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "audit.view");
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const docs = await AuditEntry.find(filterOf(workspaceId, q)).sort({ seq: -1 }).limit(limit + 1).lean<AuditEntryDocument[]>();
    const page = docs.slice(0, limit);
    const actors = await AuditEntry.aggregate<{ _id: Types.ObjectId; name: string | null }>([
      { $match: { workspaceId: oid(workspaceId), actorId: { $ne: null } } },
      { $group: { _id: "$actorId", name: { $last: "$actorName" } } },
    ]);
    return {
      entries: page.map(view),
      nextBefore: docs.length > limit ? page.at(-1)!.seq : null,
      actors: actors.map((a) => ({ id: String(a._id), name: a.name ?? "Someone" })),
    };
  });
}

/** The whole chain, checked from the first entry, a page at a time. */
export function verifyAudit(userId: string, workspaceId: string): Promise<ChainCheck & { checkedAt: string }> {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "audit.view");
    const checker = new ChainChecker(sha256);
    let after = 0;
    for (;;) {
      const docs = await AuditEntry.find({ workspaceId: oid(workspaceId), seq: { $gt: after } }).sort({ seq: 1 }).limit(PAGE).lean<AuditEntryDocument[]>();
      for (const doc of docs) checker.add({ ...fieldsOf(doc), prevHash: doc.prevHash, hash: doc.hash } satisfies ChainEntry);
      const result = checker.result();
      if (!result.ok || docs.length < PAGE) return { ...result, checkedAt: new Date().toISOString() };
      after = docs.at(-1)!.seq;
    }
  });
}

/** Every entry matching the filters, oldest first, for the CSV export (up to 50,000). */
export function exportAudit(userId: string, workspaceId: string, q: AuditQuery = {}) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "audit.view");
    const docs = await AuditEntry.find(filterOf(workspaceId, { ...q, before: undefined })).sort({ seq: 1 }).limit(50_000).lean<AuditEntryDocument[]>();
    return docs.map(view);
  });
}
