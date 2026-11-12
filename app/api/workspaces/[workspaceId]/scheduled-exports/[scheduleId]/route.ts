import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { scheduledExportBodySchema } from "@/src/core/schemas/ledger";
import { deleteScheduledExport, updateScheduledExport } from "@/src/server/scheduled-exports";

/** Replaces a schedule (and pauses or resumes it with `paused`). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string; scheduleId: string }> },
) {
  try {
    const { workspaceId, scheduleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(scheduleId, "scheduleId");
    const body = scheduledExportBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ schedule: await updateScheduledExport(ctx.userId, workspaceId, scheduleId, { ...body, budgetPoolId: body.budgetPoolId ?? null }) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; scheduleId: string }> },
) {
  try {
    const { workspaceId, scheduleId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(scheduleId, "scheduleId");
    const { ctx } = await getLedgerProvider();
    await deleteScheduledExport(ctx.userId, workspaceId, scheduleId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
