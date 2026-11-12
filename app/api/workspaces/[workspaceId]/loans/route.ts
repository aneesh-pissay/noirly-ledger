import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { loanBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { createLoan, listLoans } from "@/src/server/loans";

/** Loans repaid in EMIs, each with its schedule and where it stands. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listLoans(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Sets up a loan account's repayment schedule. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = loanBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const loan = await createLoan(ctx.userId, workspaceId, {
      name: body.name,
      loanAccountId: body.loanAccountId,
      payFromAccountId: body.payFromAccountId,
      categoryId: body.categoryId ?? null,
      principalMinor: Math.abs(parseMajorToMinor(body.principalMajor)),
      annualRatePct: body.annualRatePct,
      months: body.months,
      firstDate: body.firstDate,
    });
    return jsonOk({ loan }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
