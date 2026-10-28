import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { debtSettingsBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { listDebts, saveDebtSettings } from "@/src/server/debts";

/** What the workspace owes on loans and cards, with each one's rate and minimum, and the payoff plan chosen. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listDebts(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Saves the payoff plan, the extra a month, or one debt's rate and minimum. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = debtSettingsBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await saveDebtSettings(ctx.userId, workspaceId, {
      strategy: body.strategy,
      extraMonthlyMinor: body.extraMonthlyMajor === undefined ? undefined : Math.abs(parseMajorToMinor(body.extraMonthlyMajor)),
      debt: body.debt && {
        accountId: body.debt.accountId,
        annualRatePct: body.debt.annualRatePct,
        minimumMinor: body.debt.minimumMajor === undefined ? undefined : body.debt.minimumMajor === null ? null : Math.abs(parseMajorToMinor(body.debt.minimumMajor)),
      },
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
