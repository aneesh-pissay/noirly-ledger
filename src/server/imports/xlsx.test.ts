import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readXlsx } from "./xlsx";

/** A minimal zip (no CRCs checked by the reader), each file stored or deflated. */
function zip(files: Record<string, string>, deflate: boolean) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const workbook = {
  "xl/workbook.xml": '<workbook><sheets><sheet name="Statement" sheetId="1" r:id="rId1"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  "xl/sharedStrings.xml": "<sst><si><t>Date</t></si><si><t>Narration</t></si><si><t>Amount</t></si><si><r><t>Coffee &amp; </t></r><r><t>cake</t></r></si></sst>",
  "xl/worksheets/sheet1.xml":
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
    '<row r="2"><c r="A2" s="1"><v>46300</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-250.5</v></c></row>' +
    '<row r="3"><c r="A3"><v>46301</v></c><c r="C3"><v>1000</v></c></row>' +
    '<row r="4"><c r="B4" t="inlineStr"><is><t>Inline note</t></is></c></row>' +
    "</sheetData></worksheet>",
};

describe("readXlsx", () => {
  it("reads the first sheet, shared and inline strings, and keeps empty cells in place", () => {
    for (const deflate of [false, true]) {
      expect(readXlsx(zip(workbook, deflate))).toEqual([
        ["Date", "Narration", "Amount"],
        ["46300", "Coffee & cake", "-250.5"],
        ["46301", "", "1000"],
        ["", "Inline note"],
      ]);
    }
  });

  it("says so when the file isn't a workbook", () => {
    expect(() => readXlsx(Buffer.from("Date,Amount\n"))).toThrow("isn't an .xlsx file");
  });
});
