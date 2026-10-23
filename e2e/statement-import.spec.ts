import { deflateRawSync } from "node:zlib";
import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Row = { line: number; date: string | null; amountMinor: number | null; error: string | null; duplicate: boolean };
type Preview = { headers: string[]; preamble: string[]; mapping: Record<string, unknown>; rows: Row[] };
type Batch = { id: string; createdCount: number; skippedCount: number; liveCount: number; rolledBack: boolean };

/** Like an HDFC savings export: account details first, then withdrawal and deposit columns. */
const HDFC = [
  "HDFC BANK Ltd.,,,,,,",
  "Statement of account,,,,,,",
  "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
  '01/10/26,"UPI-SWIGGY-swiggy@icici",428512345678,01/10/26,450.00,,"10,550.00"',
  "02/10/26,NEFT CR-ACME PAYROLL,N2810,02/10/26,,\"50,000.00\",\"60,550.00\"",
  "03/10/26,ATM WDL,,03/10/26,2000.00,,58550.00",
  "04/10/26,Opening note,,,,,",
].join("\n");

/** A one-sheet .xlsx with a Dr/Cr column and spreadsheet date numbers. */
function workbook() {
  const files: Record<string, string> = {
    "xl/workbook.xml": '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Txn Date</t></si><si><t>Description</t></si><si><t>Amount</t></si><si><t>Dr/Cr</t></si><si><t>Fuel</t></si><si><t>DR</t></si><si><t>Cashback</t></si><si><t>CR</t></si></sst>",
    "xl/worksheets/sheet1.xml":
      "<worksheet><sheetData>" +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
      '<row r="2"><c r="A2"><v>46300</v></c><c r="B2" t="s"><v>4</v></c><c r="C2"><v>1200</v></c><c r="D2" t="s"><v>5</v></c></row>' +
      '<row r="3"><c r="A3"><v>46301</v></c><c r="B3" t="s"><v>6</v></c><c r="C3"><v>50.25</v></c><c r="D3" t="s"><v>7</v></c></row>' +
      "</sheetData></worksheet>",
  };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(content));
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centrals.reduce((n, b) => n + b.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

test.describe("statement import", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ira Import");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("preview, import, spot duplicates, and undo", async () => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "HDFC", kind: "bank", currency: "INR", openingMajor: "11000.00", openingDate: "2026-09-30" } })).json()) as { account: { id: string } };
    const file = { name: "hdfc.csv", mimeType: "text/csv", buffer: Buffer.from(HDFC) };

    const previewed = await owner.api.post(`/api/workspaces/${ws}/imports/preview`, { multipart: { file, accountId: account.id } });
    expect(previewed.status(), await previewed.text()).toBe(200);
    const { preview } = (await previewed.json()) as { preview: Preview };
    expect(preview.preamble).toEqual(["HDFC BANK Ltd.", "Statement of account"]);
    expect(preview.mapping).toMatchObject({ headerRow: 2, date: 0, debit: 4, credit: 5, reference: 2 });
    expect(preview.rows.map((r) => [r.line, r.date, r.amountMinor, r.error])).toEqual([
      [4, "2026-10-01", -45_000, null],
      [5, "2026-10-02", 5_000_000, null],
      [6, "2026-10-03", -200_000, null],
      [7, "2026-10-04", null, "No amount"],
    ]);

    // Leave out the ATM line.
    const commit = (skipLines: number[]) =>
      owner.api.post(`/api/workspaces/${ws}/imports`, { multipart: { file, accountId: account.id, mapping: JSON.stringify(preview.mapping), skipLines: JSON.stringify(skipLines) } });
    const imported = await commit([6]);
    expect(imported.status(), await imported.text()).toBe(201);
    const { batch } = (await imported.json()) as { batch: Batch };
    expect(batch).toMatchObject({ createdCount: 2, skippedCount: 2 });
    const txns = ((await (await owner.api.get(`/api/workspaces/${ws}/transactions?accountId=${account.id}`)).json()) as { items: Array<{ type: string; amountMinor: number; note: string; upiRef: string | null }> }).items;
    expect(txns.map((t) => [t.type, t.amountMinor, t.upiRef]).sort()).toEqual([["expense", 45_000, "428512345678"], ["income", 5_000_000, null]]);
    const { accounts } = (await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json()) as { accounts: Array<{ balanceMinor: number }> };
    expect(accounts[0]!.balanceMinor).toBe(1_100_000 - 45_000 + 5_000_000);

    // The same file again: what's in looks already recorded.
    const again = ((await (await owner.api.post(`/api/workspaces/${ws}/imports/preview`, { multipart: { file, accountId: account.id } })).json()) as { preview: Preview }).preview;
    expect(again.rows.map((r) => r.duplicate)).toEqual([true, true, false, false]);
    const nothing = await commit([4, 5, 6]);
    expect(nothing.status()).toBe(400);

    // Undo takes back exactly what it added.
    const undone = await owner.api.delete(`/api/imports/${batch.id}`);
    expect(((await undone.json()) as { batch: Batch }).batch).toMatchObject({ rolledBack: true, liveCount: 0 });
    expect(((await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: unknown[] }).items).toHaveLength(0);
    expect((await owner.api.delete(`/api/imports/${batch.id}`)).status()).toBe(409);
  });

  test("reads an Excel workbook with a Dr/Cr column", async () => {
    const ws = await personalWorkspaceId(owner);
    const file = { name: "card.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: workbook() };
    const { preview } = (await (await owner.api.post(`/api/workspaces/${ws}/imports/preview`, { multipart: { file } })).json()) as { preview: Preview };
    expect(preview.mapping).toMatchObject({ amount: 2, drCr: 3 });
    expect(preview.rows.map((r) => [r.date, r.amountMinor])).toEqual([["2026-10-05", -120_000], ["2026-10-06", 5_025]]);
    const imported = await owner.api.post(`/api/workspaces/${ws}/imports`, { multipart: { file, mapping: JSON.stringify(preview.mapping) } });
    expect(imported.status(), await imported.text()).toBe(201);
    expect(((await imported.json()) as { batch: Batch }).batch.createdCount).toBe(2);
    expect((await owner.api.post(`/api/workspaces/${ws}/imports/preview`, { multipart: { file: { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("") } } })).status()).toBe(400);
  });

  test("import a statement in the app, then undo it", async ({ browser }) => {
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("link", { name: "Import statement" }).click();
    await expect(page).toHaveURL(/\/transactions\/import$/);
    await page.getByLabel("Statement file").setInputFiles({ name: "hdfc.csv", mimeType: "text/csv", buffer: Buffer.from(HDFC) });
    const table = page.getByRole("table", { name: "Statement rows" });
    await expect(table.locator("[data-import-line]")).toHaveCount(4);
    await expect(table.locator('[data-import-line="7"]')).toContainText("No amount");
    await page.getByLabel("Import line 6").uncheck();
    await page.screenshot({ path: "test-results/import-preview.png", fullPage: true });
    await page.getByRole("button", { name: "Import 2 transactions" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 2 transactions from hdfc.csv.");
    const recent = page.locator('[data-import="hdfc.csv"]');
    await expect(recent).toContainText("2 added, 2 skipped");
    page.once("dialog", (d) => void d.accept());
    await recent.getByRole("button", { name: "Undo" }).click();
    await expect(recent).toContainText("Undone");
    await page.goto("/transactions");
    await expect(page.getByText("No transactions yet.")).toBeVisible();
    await context.close();
  });
});
