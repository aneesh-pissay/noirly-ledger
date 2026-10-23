import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { installmentPlanBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { createInstallmentPlan, listInstallmentPlans } from "@/src/server/installments";

/** The workspace's EMI plans with how far along each is. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ plans: await listInstallmentPlans(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Starts an EMI purchase, adding every installment as a dated expense. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = installmentPlanBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    const plan = await createInstallmentPlan(sync, ctx.userId, workspaceId, {
      name: body.name,
      principalMinor: parseMajorToMinor(body.principalMajor),
      currency: body.currency,
      months: body.months,
      annualRatePct: body.annualRatePct,
      taxOnInterestPct: body.taxOnInterestPct,
      processingFeeMinor: body.processingFeeMajor ? parseMajorToMinor(body.processingFeeMajor) : 0,
      firstDate: body.firstDate,
      accountId: body.accountId ?? null,
      categoryId: body.categoryId ?? null,
    });
    return jsonOk({ plan }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
