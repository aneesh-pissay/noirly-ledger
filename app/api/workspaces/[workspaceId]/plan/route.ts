import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { monthPlanBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { getMonthPlan, setExpectedIncome } from "@/src/server/plan";

/** The month's zero-based plan (?month=YYYY-MM, default this month). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const { ctx } = await getLedgerProvider();
    return jsonOk({ plan: await getMonthPlan(ctx.userId, workspaceId, month) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Sets the income a month is planned with; null goes back to what's arrived. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = monthPlanBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await setExpectedIncome(ctx.userId, workspaceId, body.month, body.expectedIncomeMajor ? parseMajorToMinor(body.expectedIncomeMajor) : null);
    return jsonOk({ plan: await getMonthPlan(ctx.userId, workspaceId, body.month) });
  } catch (error) {
    return jsonError(error);
  }
}
