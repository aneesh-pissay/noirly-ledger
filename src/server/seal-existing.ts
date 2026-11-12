import { withDb } from "@/src/server/db/mongodb";
import { ScheduledPayment, Transaction } from "@/src/server/models";

/** Notes written before they were sealed, a batch at a time. */
const BATCH = 1000;
const STILL_PLAIN = { note: { $type: "string", $not: /^enc1:/ } };

/**
 * Seals notes stored before notes were sealed. Each daily run takes a
 * batch, and setting a note seals it (and gives it search terms), so it's
 * safe to run any number of times.
 */
export function sealExistingNotes(limit = BATCH) {
  return withDb(async () => {
    let sealed = 0;
    for (const Model of [Transaction, ScheduledPayment] as const) {
      // The raw text: the read hooks would hand back what's already sealed opened anyway.
      const rows = await (Model as typeof Transaction).collection.find(STILL_PLAIN, { projection: { note: 1 } }).limit(limit - sealed).toArray();
      for (const row of rows) {
        // Through the model, so the write hook seals it.
        await (Model as typeof Transaction).updateOne({ _id: row._id, note: row.note }, { $set: { note: row.note as string } });
        sealed += 1;
      }
      if (sealed >= limit) break;
    }
    return { notesSealed: sealed };
  });
}
