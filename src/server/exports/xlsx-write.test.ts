import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { columnName, writeXlsx } from "./xlsx-write";
import { readXlsx } from "@/src/server/imports/xlsx";

describe("writeXlsx", () => {
  it("writes a workbook the importer reads back, text and numbers in place", () => {
    const file = writeXlsx("Ledger: Oct/2026", [
      ["date", "note", "amount"],
      ["2026-10-01", "Coffee & <cake>", -12.5],
      ["2026-10-02", null, 1000],
    ]);
    expect(file.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(readXlsx(file)).toEqual([
      ["date", "note", "amount"],
      ["2026-10-01", "Coffee & <cake>", "-12.5"],
      ["2026-10-02", "", "1000"],
    ]);
  });

  it("stores real checksums, so spreadsheet apps accept it", () => {
    const file = writeXlsx("Sheet", [["x"]]);
    // The first entry: its stored CRC matches its inflated content.
    const crc = file.readUInt32LE(14);
    const compressed = file.readUInt32LE(18);
    const nameLength = file.readUInt16LE(26);
    const content = inflateRawSync(file.subarray(30 + nameLength, 30 + nameLength + compressed));
    let c = 0xffffffff;
    for (const byte of content) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    expect(crc).toBe((c ^ 0xffffffff) >>> 0);
  });

  it("names columns past Z", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});
