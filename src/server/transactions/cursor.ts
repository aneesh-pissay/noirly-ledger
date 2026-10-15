import { Types } from "mongoose";

/**
 * Transactions list newest date first, ties broken by id. A page cursor has to
 * carry both, or paging by id alone skips and repeats rows entered out of
 * date order. Format: `<date ms>_<id>`; opaque to clients.
 */
export function encodeTransactionCursor(doc: { date: Date; _id: Types.ObjectId }): string {
  return `${doc.date.getTime()}_${doc._id.toString()}`;
}

export function decodeTransactionCursor(cursor: string): { date: Date; id: Types.ObjectId } | null {
  const match = /^(\d{1,15})_([a-f0-9]{24})$/i.exec(cursor);
  if (!match) return null;
  return { date: new Date(Number(match[1])), id: new Types.ObjectId(match[2]) };
}

/** Rows strictly after the cursor in `{ date: -1, _id: -1 }` order. */
export function afterCursorFilter(position: { date: Date; id: Types.ObjectId }) {
  return {
    $or: [
      { date: { $lt: position.date } },
      { date: position.date, _id: { $lt: position.id } },
    ],
  };
}
