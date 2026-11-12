import { z } from "zod";
import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { applyRulesToPast } from "@/src/server/transaction-rules";

const bodySchema = z.object({ dryRun: z.boolean().default(true) });

/** Runs the rules over past expenses and income, filling only what's empty; `{ dryRun: true }` just counts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const { ctx } = await getLedgerProvider();
    return jsonOk(await applyRulesToPast(ctx.userId, workspaceId, body.dryRun));
  } catch (error) {
    return jsonError(error);
  }
}
