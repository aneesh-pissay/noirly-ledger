import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { upsertBudgetBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getLedgerProvider();
    const budgets = await sync.listBudgets(workspaceId);
    return jsonOk({ budgets });
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
    const body = upsertBudgetBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const budget = await sync.upsertBudget({
      workspaceId,
      categoryId: body.categoryId,
      period: body.period,
      periodStart: body.periodStart ?? null,
      periodEnd: body.periodEnd ?? null,
      limitAmountMinor: parseMajorToMinor(body.limitMajor),
      currency: body.currency,
      alertThresholdPct: body.alertThresholdPct,
      rollover: body.rollover,
      rolloverSince: body.rolloverSince,
    });
    return jsonOk({ budget });
  } catch (error) {
    return jsonError(error);
  }
}
