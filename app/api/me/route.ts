import { getLedgerProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { deleteLedgerAccountData } from "@/src/server/users/delete-account";
import { meSettingsBodySchema } from "@/src/core/schemas/ledger";
import { LedgerUser } from "@/src/server/models";

export async function GET() {
  try {
    const { ctx } = await getLedgerProvider();
    return jsonOk({
      user: {
        id: ctx.userId,
        email: ctx.email,
        displayName: ctx.displayName,
        identitySub: ctx.identitySub,
        baseCurrency: ctx.baseCurrency,
        numberFormat: ctx.numberFormat,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** This person's reading preferences: how amounts are grouped. */
export async function PATCH(request: Request) {
  try {
    const body = meSettingsBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    await withDb(() => LedgerUser.updateOne({ _id: ctx.userId }, { $set: { numberFormat: body.numberFormat } }));
    return jsonOk({ numberFormat: body.numberFormat });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Deletes this person's Ledger data (see deleteLedgerAccountData). The mobile
 * app calls it before deleting the Noirly account itself; Identity's
 * account-deleted notice covers every other path.
 */
export async function DELETE() {
  try {
    const { ctx } = await getLedgerProvider();
    const summary = await withDb(() => deleteLedgerAccountData(ctx.identitySub));
    return jsonOk({ ok: true, ...summary });
  } catch (error) {
    return jsonError(error);
  }
}
