import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { scheduledExportBodySchema } from "@/src/core/schemas/ledger";
import { createScheduledExport, listScheduledExports } from "@/src/server/scheduled-exports";

/** The workspace's scheduled reports. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listScheduledExports(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Schedules a report to be emailed to members. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = scheduledExportBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ schedule: await createScheduledExport(ctx.userId, workspaceId, { ...body, budgetPoolId: body.budgetPoolId ?? null }) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
