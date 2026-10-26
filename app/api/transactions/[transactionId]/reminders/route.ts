import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reminderSettingsSchema } from "@/src/core/schemas/ledger";
import { setReminders } from "@/src/server/reminders";

/** A recurring rule's reminders: notice before each charge, a trial's end, a date to cancel by. Null goes back to the default. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    await assertObjectId(transactionId, "transactionId");
    const body = reminderSettingsSchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ reminders: await setReminders(ctx.userId, transactionId, body) });
  } catch (error) {
    return jsonError(error);
  }
}
