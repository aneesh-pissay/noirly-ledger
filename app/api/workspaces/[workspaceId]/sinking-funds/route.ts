import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { sinkingFundBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { createSinkingFund, listSinkingFunds } from "@/src/server/sinking-funds";

/** Sinking funds, soonest due first, and bills that come in a lump worth starting one for. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listSinkingFunds(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = sinkingFundBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const fund = await createSinkingFund(ctx.userId, workspaceId, {
      name: body.name,
      targetMinor: Math.abs(parseMajorToMinor(body.targetMajor)),
      currency: body.currency,
      dueDate: body.dueDate,
      repeat: body.repeat ?? "none",
      savedMinor: body.savedMajor ? Math.abs(parseMajorToMinor(body.savedMajor)) : 0,
      ruleId: body.ruleId ?? null,
      paymentId: body.paymentId ?? null,
    });
    return jsonOk({ fund }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
