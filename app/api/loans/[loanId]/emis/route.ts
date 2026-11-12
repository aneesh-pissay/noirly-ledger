import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { recordEmiBodySchema } from "@/src/core/schemas/ledger";
import { recordEmi, undoLastEmi } from "@/src/server/loans";

/** Records the next EMI as paid. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ loanId: string }> },
) {
  try {
    const { loanId } = await params;
    await assertObjectId(loanId, "loanId");
    const body = recordEmiBodySchema.parse(await request.json());
    const { ctx, sync } = await getLedgerProvider();
    return jsonOk({ loan: await recordEmi(sync, ctx.userId, loanId, body.date ?? null) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Takes back the last EMI recorded. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ loanId: string }> },
) {
  try {
    const { loanId } = await params;
    await assertObjectId(loanId, "loanId");
    const { ctx, sync } = await getLedgerProvider();
    return jsonOk({ loan: await undoLastEmi(sync, ctx.userId, loanId) });
  } catch (error) {
    return jsonError(error);
  }
}
