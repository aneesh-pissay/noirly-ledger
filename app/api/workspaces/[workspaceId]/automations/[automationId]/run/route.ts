import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { runAutomationNow } from "@/src/server/automations";

/** Runs an automation now; its schedule stays as it is. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string; automationId: string }> },
) {
  try {
    const { workspaceId, automationId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    await assertObjectId(automationId, "automationId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ automation: await runAutomationNow(ctx.userId, workspaceId, automationId) });
  } catch (error) {
    return jsonError(error);
  }
}
