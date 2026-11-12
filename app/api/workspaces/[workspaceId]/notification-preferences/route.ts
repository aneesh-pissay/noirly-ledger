import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { notificationPrefsBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { getMyPrefs, setMyPrefs } from "@/src/server/notification-prefs";

/** Your own notification settings for this workspace. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ prefs: await getMyPrefs(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { largeExpenseMajor, ...body } = notificationPrefsBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const prefs = await setMyPrefs(ctx.userId, workspaceId, { ...body, largeExpenseMinor: largeExpenseMajor ? parseMajorToMinor(largeExpenseMajor) : null });
    return jsonOk({ prefs });
  } catch (error) {
    return jsonError(error);
  }
}
