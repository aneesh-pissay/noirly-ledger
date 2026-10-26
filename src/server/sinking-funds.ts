import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { ScheduledPayment, SinkingFund, Transaction as TransactionModel } from "@/src/server/models";
import type { SinkingFundDocument } from "@/src/server/models/SinkingFund";
import type { TransactionDocument } from "@/src/server/models/Transaction";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { nextOccurrence } from "@/src/core/recurrence/next";
import { afterSpending, fundProgress, monthsLeft, nextFundDue, type FundRepeat, type FundSuggestion, type SinkingFundView } from "@/src/core/sinking-funds";
import type { RecurrenceFrequency } from "@/src/core/models/enums";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Suggestions need time to save: a due date at least this far off. */
const SUGGEST_MIN_DAYS = 45;

function toView(doc: SinkingFundDocument, asOf: string): SinkingFundView {
  const progress = fundProgress({ targetMinor: doc.targetMinor, savedMinor: doc.savedMinor, dueDate: doc.dueDate, startDate: doc.startDate }, asOf);
  return {
    id: String(doc._id),
    name: doc.name,
    targetMinor: doc.targetMinor,
    savedMinor: doc.savedMinor,
    currency: doc.currency,
    dueDate: doc.dueDate,
    startDate: doc.startDate,
    repeat: (doc.repeat ?? "none") as FundRepeat,
    ruleId: doc.ruleId ? String(doc.ruleId) : null,
    paymentId: doc.paymentId ? String(doc.paymentId) : null,
    ...progress,
  };
}

/** The next charge of a recurring rule on or after `asOf`, or null once it has ended. */
function nextCharge(rule: TransactionDocument, lastPosted: Date | undefined, asOf: string) {
  const recurrence = rule.recurrence!;
  const rhythm = { frequency: recurrence.frequency as RecurrenceFrequency, interval: recurrence.interval, byMonthDay: recurrence.frequency === "monthly" ? rule.date.getUTCDate() : undefined };
  let next = lastPosted ? nextOccurrence(lastPosted, rhythm) : rule.date;
  while (next.toISOString().slice(0, 10) < asOf) next = nextOccurrence(next, rhythm);
  const date = next.toISOString().slice(0, 10);
  return recurrence.until && date > recurrence.until.toISOString().slice(0, 10) ? null : date;
}

/** Bills that come in a lump, not yet saved for: yearly and quarterly recurring expenses, and bills to pay a while off. */
async function suggestions(workspaceId: Types.ObjectId, asOf: string, funds: SinkingFundDocument[]): Promise<FundSuggestion[]> {
  const linkedRules = new Set(funds.map((f) => (f.ruleId ? String(f.ruleId) : null)).filter(Boolean));
  const linkedPayments = new Set(funds.map((f) => (f.paymentId ? String(f.paymentId) : null)).filter(Boolean));
  const far = (date: string) => Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`) >= SUGGEST_MIN_DAYS * 86_400_000;

  const rules = (await TransactionModel.find({ workspaceId, deletedAt: null, isRecurring: true, recurringParentId: null, type: "expense", recurrence: { $ne: null } }).lean<TransactionDocument[]>()).filter(
    (r) => !linkedRules.has(String(r._id)) && (r.recurrence!.frequency === "yearly" || (r.recurrence!.frequency === "monthly" && r.recurrence!.interval >= 3)),
  );
  const latest = rules.length
    ? await TransactionModel.aggregate<{ _id: Types.ObjectId; date: Date }>([
        { $match: { recurringParentId: { $in: rules.map((r) => r._id) } } },
        { $group: { _id: "$recurringParentId", date: { $max: "$date" } } },
      ])
    : [];
  const lastPosted = new Map(latest.map((row) => [String(row._id), row.date]));
  const fromRules = rules.flatMap((r): FundSuggestion[] => {
    const due = nextCharge(r, lastPosted.get(String(r._id)), asOf);
    if (!due || !far(due)) return [];
    const repeat: FundRepeat = r.recurrence!.frequency === "yearly" ? "yearly" : "quarterly";
    return [{ source: "rule", id: String(r._id), name: r.merchant ?? r.note ?? "Recurring bill", amountMinor: r.amountMinor, currency: r.currency, dueDate: due, repeat, monthlyMinor: Math.ceil(r.amountMinor / Math.max(1, monthsLeft(asOf, due)) / 100) * 100 }];
  });

  const payments = await ScheduledPayment.find({ workspaceId, paidOn: null, dueDate: { $gte: asOf } }).lean();
  const fromPayments = payments.flatMap((p): FundSuggestion[] => {
    if (linkedPayments.has(String(p._id)) || !far(p.dueDate) || p.repeat === "monthly") return [];
    const repeat: FundRepeat = p.repeat === "yearly" ? "yearly" : p.repeat === "quarterly" ? "quarterly" : "none";
    return [{ source: "payment", id: String(p._id), name: p.name, amountMinor: p.amountMinor, currency: p.currency, dueDate: p.dueDate, repeat, monthlyMinor: Math.ceil(p.amountMinor / Math.max(1, monthsLeft(asOf, p.dueDate)) / 100) * 100 }];
  });
  return [...fromRules, ...fromPayments].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

/** The workspace's open funds, soonest due first, with what to set aside a month in all; and bills worth a fund. */
export function listSinkingFunds(userId: string, workspaceId: string): Promise<{ funds: SinkingFundView[]; suggestions: FundSuggestion[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const asOf = today();
    const docs = await SinkingFund.find({ workspaceId: ws, closedAt: null }).sort({ dueDate: 1 }).lean<SinkingFundDocument[]>();
    return { funds: docs.map((d) => toView(d, asOf)), suggestions: await suggestions(ws, asOf, docs) };
  });
}

export type FundInput = {
  name: string;
  targetMinor: number;
  currency: string;
  dueDate: string;
  repeat: FundRepeat;
  savedMinor?: number;
  ruleId?: string | null;
  paymentId?: string | null;
};

export function createSinkingFund(userId: string, workspaceId: string, input: FundInput) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    const ws = oid(workspaceId);
    if (input.dueDate <= today()) throw new ApiError(400, "invalid_request", "A fund saves for something ahead: pick a later date");
    // A fund tied to a bill must be for a bill in this workspace.
    if (input.ruleId && !(await TransactionModel.exists({ _id: oid(input.ruleId), workspaceId: ws, deletedAt: null }))) throw new ApiError(400, "invalid_request", "That bill isn't in this workspace");
    if (input.paymentId && !(await ScheduledPayment.exists({ _id: oid(input.paymentId), workspaceId: ws }))) throw new ApiError(400, "invalid_request", "That bill isn't in this workspace");
    const doc = await SinkingFund.create({
      workspaceId: ws,
      name: input.name.trim(),
      targetMinor: input.targetMinor,
      savedMinor: input.savedMinor ?? 0,
      currency: input.currency.toUpperCase(),
      startDate: today(),
      dueDate: input.dueDate,
      repeat: input.repeat,
      ruleId: input.ruleId ? oid(input.ruleId) : null,
      paymentId: input.paymentId ? oid(input.paymentId) : null,
      createdById: oid(userId),
    });
    return toView(doc.toObject() as SinkingFundDocument, today());
  });
}

async function requireFund(userId: string, fundId: string) {
  const doc = await SinkingFund.findOne({ _id: oid(fundId), closedAt: null });
  if (!doc) throw new ApiError(404, "not_found", "Fund not found");
  await requireAction(userId, String(doc.workspaceId), "expense.submit");
  return doc;
}

export function updateSinkingFund(userId: string, fundId: string, patch: Partial<Pick<FundInput, "name" | "targetMinor" | "dueDate" | "repeat">>) {
  return withDb(async () => {
    const doc = await requireFund(userId, fundId);
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.targetMinor !== undefined) doc.targetMinor = patch.targetMinor;
    if (patch.dueDate !== undefined) doc.dueDate = patch.dueDate;
    if (patch.repeat !== undefined) doc.repeat = patch.repeat;
    await doc.save();
    return toView(doc.toObject() as SinkingFundDocument, today());
  });
}

/** Sets money aside (positive) or takes some out (negative); a fund can't go below nothing. */
export function moveFundMoney(userId: string, fundId: string, amountMinor: number) {
  return withDb(async () => {
    const doc = await requireFund(userId, fundId);
    const updated = await SinkingFund.findOneAndUpdate(
      { _id: doc._id, savedMinor: { $gte: -amountMinor } },
      { $inc: { savedMinor: amountMinor } },
      { new: true },
    ).lean<SinkingFundDocument>();
    if (!updated) throw new ApiError(400, "insufficient", "There isn't that much in the fund");
    return toView(updated, today());
  });
}

/**
 * The expense was paid from the fund: what it cost comes out, and a
 * repeating fund starts its next round for the next due date with anything
 * left over; a one-off one closes.
 */
export function spendFund(userId: string, fundId: string, spentMinor?: number | null) {
  return withDb(async () => {
    const doc = await requireFund(userId, fundId);
    const saved = afterSpending(doc.savedMinor, spentMinor ?? doc.targetMinor);
    const next = nextFundDue(doc.dueDate, (doc.repeat ?? "none") as FundRepeat);
    if (!next) {
      doc.closedAt = new Date();
      doc.savedMinor = saved;
      await doc.save();
      return { fund: null };
    }
    doc.savedMinor = saved;
    doc.startDate = today();
    // A due date already gone by moves on until it's ahead.
    let due = next;
    while (due <= today()) due = nextFundDue(due, (doc.repeat ?? "none") as FundRepeat)!;
    doc.dueDate = due;
    await doc.save();
    return { fund: toView(doc.toObject() as SinkingFundDocument, today()) };
  });
}

export function deleteSinkingFund(userId: string, fundId: string) {
  return withDb(async () => {
    const doc = await requireFund(userId, fundId);
    await doc.deleteOne();
  });
}
