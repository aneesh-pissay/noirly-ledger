import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { cardTermsBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { DEFAULT_MINIMUM_PCT } from "@/src/core/credit-cards";
import { setCardTerms } from "@/src/server/credit-cards";

/** A credit card's statement day, days to pay, limit and minimum share; null clears them. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    await assertObjectId(accountId, "accountId");
    const body = cardTermsBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk(
      await setCardTerms(
        ctx.userId,
        accountId,
        body && {
          statementDay: body.statementDay,
          dueDays: body.dueDays,
          creditLimitMinor: body.creditLimitMajor ? Math.abs(parseMajorToMinor(body.creditLimitMajor)) : null,
          minimumPct: body.minimumPct ?? DEFAULT_MINIMUM_PCT,
        },
      ),
    );
  } catch (error) {
    return jsonError(error);
  }
}
