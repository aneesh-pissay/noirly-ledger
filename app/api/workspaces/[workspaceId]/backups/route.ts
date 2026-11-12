import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { backupScheduleBodySchema } from "@/src/core/schemas/ledger";
import { getBackupSettings, setBackupSchedule } from "@/src/server/backups";

type Params = { params: Promise<{ workspaceId: string }> };

/** The backup schedule and the backups kept. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await getBackupSettings(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = backupScheduleBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(await setBackupSchedule(ctx.userId, workspaceId, body));
  } catch (error) {
    return jsonError(error);
  }
}
