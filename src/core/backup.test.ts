import { describe, expect, it } from "vitest";
import { checkExport, exportValue, fileSlug, idMapFor, isBackupDue, restoreValue } from "./backup";

const objectId = (hex: string) => ({ toHexString: () => hex });

describe("export and backups", () => {
  it("turns stored documents into plain JSON, dropping secrets and opening sealed text", () => {
    const doc = {
      _id: objectId("a".repeat(24)),
      workspaceId: objectId("b".repeat(24)),
      date: new Date("2026-10-31T12:00:00Z"),
      note: "enc1:xyz",
      noteTerms: ["h1", "h2"],
      secret: "whsec",
      numberSealed: "enc1:acct",
      numberLast4: "6789",
      __v: 0,
      changes: [{ field: "note", from: "enc1:old", to: null }],
      splits: [{ categoryId: objectId("c".repeat(24)), amountMinor: 100 }],
    };
    expect(exportValue(doc, (s) => `opened(${s.slice(5)})`)).toEqual({
      id: "a".repeat(24),
      workspaceId: "b".repeat(24),
      date: "2026-10-31T12:00:00.000Z",
      note: "opened(xyz)",
      numberLast4: "6789",
      changes: [{ field: "note", from: "opened(old)", to: null }],
      splits: [{ categoryId: "c".repeat(24), amountMinor: 100 }],
    });
  });

  it("knows when a backup is due", () => {
    const now = new Date("2026-10-31T06:00:00Z");
    expect(isBackupDue("daily", null, now)).toBe(true);
    expect(isBackupDue("daily", new Date("2026-10-30T06:30:00Z"), now)).toBe(true);
    expect(isBackupDue("daily", new Date("2026-10-31T00:00:00Z"), now)).toBe(false);
    expect(isBackupDue("weekly", new Date("2026-10-26T06:00:00Z"), now)).toBe(false);
    expect(isBackupDue("weekly", new Date("2026-10-24T06:00:00Z"), now)).toBe(true);
  });

  it("checks a file is a whole export before restoring it", () => {
    const good = { format: "noirly-ledger-export", version: 1, exportedAt: "", workspace: { id: "w" }, counts: { accounts: 1 }, accounts: [{ id: "a" }] };
    expect(checkExport(good).ok).toBe(true);
    expect(checkExport({ ...good, format: "other" })).toEqual({ ok: false, error: "This isn't a Noirly Ledger export or backup" });
    expect(checkExport({ ...good, version: 2 }).ok).toBe(false);
    expect(checkExport({ ...good, accounts: [] })).toEqual({ ok: false, error: "The export looks cut short: accounts doesn't match its count" });
    expect(checkExport(null).ok).toBe(false);
  });

  it("gives every record a new id and points references at the new ones", () => {
    const data = {
      format: "noirly-ledger-export", version: 1, exportedAt: "", workspace: { id: "W" },
      counts: { categories: 1, transactions: 1 },
      categories: [{ id: "C", workspaceId: "W" }],
      transactions: [{ id: "T", workspaceId: "W", createdById: "U", splits: [{ id: "S", categoryId: "C" }] }],
    };
    let n = 0;
    const ids = idMapFor(data, () => `new${++n}`);
    expect([...ids.entries()]).toEqual([["W", "new1"], ["C", "new2"], ["T", "new3"]]);
    expect(restoreValue(data.transactions[0], ids)).toEqual({ _id: "new3", workspaceId: "new1", createdById: "U", splits: [{ _id: "S", categoryId: "new2" }] });
  });

  it("makes file names", () => {
    expect(fileSlug("Team Café Ops!")).toBe("team-cafe-ops");
    expect(fileSlug("₹₹")).toBe("workspace");
  });
});
