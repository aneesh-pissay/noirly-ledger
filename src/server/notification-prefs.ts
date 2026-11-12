import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { NotificationPreference } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { prefsProblem, withDefaults, type NotificationPrefs } from "@/src/core/notification-prefs";

type Stored = { userId: Types.ObjectId; channels?: unknown; budgetLevels?: number[]; billDaysBefore?: number | null; largeExpenseMinor?: number | null };

function fromDoc(doc: Stored | null | undefined): NotificationPrefs {
  if (!doc) return withDefaults(null);
  return withDefaults({
    channels: (doc.channels ?? undefined) as NotificationPrefs["channels"] | undefined,
    budgetLevels: doc.budgetLevels,
    billDaysBefore: doc.billDaysBefore ?? undefined,
    largeExpenseMinor: doc.largeExpenseMinor ?? null,
  });
}

/** Each person's settings in a workspace (defaults for those who never set any); no workspace means the defaults. */
export async function prefsFor(userIds: string[], workspaceId: string | null | undefined): Promise<Map<string, NotificationPrefs>> {
  const out = new Map(userIds.map((id) => [id, withDefaults(null)]));
  if (!workspaceId || !userIds.length || !Types.ObjectId.isValid(workspaceId)) return out;
  const docs = await NotificationPreference.find({ workspaceId: new Types.ObjectId(workspaceId), userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } }).lean<Stored[]>();
  for (const doc of docs) out.set(String(doc.userId), fromDoc(doc));
  return out;
}

/** Everyone in a workspace who asked to hear about expenses of at least some size, with their settings. */
export async function largeExpenseWatchers(workspaceId: Types.ObjectId, baseAmountMinor: number) {
  const docs = await NotificationPreference.find({ workspaceId, largeExpenseMinor: { $ne: null, $lte: baseAmountMinor } }).lean<Stored[]>();
  return docs.map((doc) => ({ userId: String(doc.userId), prefs: fromDoc(doc) }));
}

export function getMyPrefs(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    return (await prefsFor([userId], workspaceId)).get(userId)!;
  });
}

export function setMyPrefs(userId: string, workspaceId: string, input: NotificationPrefs) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const prefs = withDefaults(input);
    const problem = prefsProblem(prefs);
    if (problem) throw new ApiError(400, "invalid_request", problem);
    await NotificationPreference.updateOne(
      { userId: new Types.ObjectId(userId), workspaceId: new Types.ObjectId(workspaceId) },
      { $set: { channels: prefs.channels, budgetLevels: prefs.budgetLevels, billDaysBefore: prefs.billDaysBefore, largeExpenseMinor: prefs.largeExpenseMinor } },
      { upsert: true },
    );
    return prefs;
  });
}
