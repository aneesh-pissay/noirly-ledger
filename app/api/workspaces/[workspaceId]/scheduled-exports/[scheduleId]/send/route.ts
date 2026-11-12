import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { sendScheduledExportNow } from "@/src/server/scheduled-exports";

export const runtime = "nodejs";

/** Sends a scheduled report now, for the period its next run would cover. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; scheduleId: string }> },
) {
  try {
    const { workspaceId, scheduleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(scheduleId, "scheduleId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ schedule: await sendScheduledExportNow(ctx.userId, workspaceId, scheduleId) });
  } catch (error) {
    return jsonError(error);
  }
}
