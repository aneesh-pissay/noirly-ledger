import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

type Flag = { kind: string; enforcement: string; message: string };
type Approval = { id: string; transactionId: string; transaction: { note: string | null }; violations: Flag[] };

test.describe("spending policies", () => {
  let owner: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel);
  });

  async function team() {
    const { workspaceId: ws, poolId } = await newTeam(owner, [mel]);
    const meals = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Meals" } })).json()) as { category: { id: string } }).category;
    const dinners = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Dinners", parentId: meals.id } })).json()) as { category: { id: string } }).category;
    const submit = (data: Record<string, unknown>) =>
      mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, currency: "USD", date: today(), ...data } });
    const inbox = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/approvals?status=submitted`)).json()) as { approvals: Approval[] }).approvals;
    return { ws, poolId, meals, dinners, submit, inbox };
  }

  test("limits and receipts flag; disallowed merchants block; a receipt added later clears its flag", async () => {
    const { ws, poolId, meals, dinners, submit, inbox } = await team();
    const add = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/spending-policies`, { data });
    // Only owners write policies, and a policy has to say something.
    expect((await mel.api.post(`/api/workspaces/${ws}/spending-policies`, { data: { name: "Mine", maxMajor: "1.00" } })).status()).toBe(403);
    expect((await add({ name: "Empty" })).status()).toBe(400);
    expect((await add({ name: "Meals", categoryIds: [meals.id], maxMajor: "50.00", receiptOverMajor: "25.00" })).status()).toBe(201);
    expect((await add({ name: "No bars", merchants: ["The  Tipsy Bar"], disallowed: true, enforcement: "block" })).status()).toBe(201);

    // The form can ask first.
    const check = await mel.api.post(`/api/workspaces/${ws}/policy-check`, { data: { budgetPoolId: poolId, amountMajor: "60.00", currency: "USD", date: today(), categoryId: dinners.id, merchant: null, hasReceipt: false } });
    expect(((await check.json()) as { violations: Flag[] }).violations.map((v) => v.kind)).toEqual(["over_limit", "missing_receipt"]);

    // A blocking policy stops submission; the merchant matches however it's spaced or cased.
    const bar = await submit({ amountMajor: "12.00", note: "Drinks", merchant: "the tipsy bar" });
    expect(bar.status()).toBe(400);
    expect(((await bar.json()) as { error: string }).error).toBe("policy_blocked");

    // Flagging ones let it through, with the flags for approvers. A subcategory counts as its parent.
    const dinner = await submit({ amountMajor: "60.00", note: "Team dinner", categoryId: dinners.id });
    expect(dinner.ok(), await dinner.text()).toBe(true);
    expect((await submit({ amountMajor: "10.00", note: "Snack", categoryId: meals.id })).ok()).toBe(true);
    let items = await inbox();
    const flagged = items.find((a) => a.transaction.note === "Team dinner")!;
    expect(flagged.violations.map((v) => v.kind)).toEqual(["over_limit", "missing_receipt"]);
    expect(items.find((a) => a.transaction.note === "Snack")!.violations).toEqual([]);

    // Attaching a receipt clears that flag; the limit flag stays.
    const upload = await mel.api.post(`/api/workspaces/${ws}/receipts`, { multipart: { file: { name: "bill.png", mimeType: "image/png", buffer: PNG } } });
    expect(upload.status(), await upload.text()).toBe(201);
    const { key } = (await upload.json()) as { key: string };
    expect((await mel.api.post(`/api/transactions/${flagged.transactionId}/attachments`, { data: { storageKey: key, name: "bill.png", contentType: "image/png", size: PNG.length } })).status()).toBe(201);
    items = await inbox();
    expect(items.find((a) => a.id === flagged.id)!.violations.map((v) => v.kind)).toEqual(["over_limit"]);
  });

  test("set up a policy; the expense form warns and the inbox flags", async ({ browser }) => {
    const { ws, poolId } = await team();
    const ownerContext = await browserAs(browser, owner);
    const page = await ownerContext.newPage();
    await page.goto(`/w/${ws}/approvals`);
    const policies = page.getByRole("region", { name: "Spending policies" });
    await policies.getByLabel("Policy name").fill("Receipts over 20");
    await policies.getByLabel("Receipt from (USD)").fill("20");
    await policies.getByRole("button", { name: "Add policy" }).click();
    await expect(policies.locator('[data-policy="Receipts over 20"]')).toContainText("receipt from");

    const melContext = await browserAs(browser, mel);
    const form = await melContext.newPage();
    await form.goto(`/w/${ws}/expenses/new?poolId=${poolId}`);
    await form.getByLabel("Amount").fill("35");
    await form.getByLabel("Note").fill("Printer ink");
    await expect(form.getByRole("list", { name: "Policy warnings" })).toContainText("Will be flagged");
    await form.getByRole("button", { name: "Submit for approval" }).click();
    await form.waitForURL(`**/w/${ws}/expenses`);
    await melContext.close();

    await page.reload();
    await expect(page.locator("li", { hasText: "Printer ink" }).locator('[data-flag="missing_receipt"]')).toContainText("needs a receipt");
    await page.screenshot({ path: "test-results/spending-policies.png", fullPage: true });
    await ownerContext.close();
  });
});
