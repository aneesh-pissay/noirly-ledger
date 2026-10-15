import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import {
  afterCursorFilter,
  decodeTransactionCursor,
  encodeTransactionCursor,
} from "@/src/server/transactions/cursor";

type Row = { date: Date; _id: Types.ObjectId };

/** The same order and filter Mongo applies, run in memory. */
function page(rows: Row[], size: number, cursor?: string) {
  const sorted = [...rows].sort((a, b) => b.date.getTime() - a.date.getTime() || (b._id.toString() < a._id.toString() ? -1 : 1));
  const position = cursor ? decodeTransactionCursor(cursor) : null;
  // What afterCursorFilter asks Mongo for (its shape is pinned below).
  const after = position
    ? sorted.filter((row) =>
        row.date < position.date ||
        (row.date.getTime() === position.date.getTime() && row._id.toString() < position.id.toString()))
    : sorted;
  const items = after.slice(0, size);
  return { items, next: after.length > size ? encodeTransactionCursor(items[items.length - 1]!) : undefined };
}

describe("transaction cursor", () => {
  it("round-trips", () => {
    const row = { date: new Date("2026-10-01T12:00:00Z"), _id: new Types.ObjectId() };
    const decoded = decodeTransactionCursor(encodeTransactionCursor(row));
    expect(decoded?.date.getTime()).toBe(row.date.getTime());
    expect(decoded?.id.toString()).toBe(row._id.toString());
  });

  it("asks for older dates, or the same date with a lower id", () => {
    const position = { date: new Date("2026-10-01T12:00:00Z"), id: new Types.ObjectId() };
    expect(afterCursorFilter(position)).toEqual({
      $or: [
        { date: { $lt: position.date } },
        { date: position.date, _id: { $lt: position.id } },
      ],
    });
  });

  it("rejects anything else", () => {
    expect(decodeTransactionCursor("abc")).toBeNull();
    expect(decodeTransactionCursor(new Types.ObjectId().toString())).toBeNull();
  });

  it("visits every row exactly once when entries are backdated", () => {
    // Entered in this order, so ids rise while dates jump around.
    const dates = ["2026-10-05", "2026-09-01", "2026-10-05", "2026-10-09", "2026-08-15", "2026-10-05", "2026-09-30"];
    const rows = dates.map((day) => ({ date: new Date(`${day}T12:00:00Z`), _id: new Types.ObjectId() }));
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const result = page(rows, 2, cursor);
      seen.push(...result.items.map((row) => row._id.toString()));
      cursor = result.next;
    } while (cursor);
    expect(seen).toHaveLength(rows.length);
    expect(new Set(seen).size).toBe(rows.length);
  });
});
