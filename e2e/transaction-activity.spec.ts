import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Activity = {
  canEdit: boolean;
  attachments: Array<{ id: string; name: string; url: string }>;
  comments: Array<{ id: string; body: string; authorName: string; canDelete: boolean }>;
  history: Array<{ action: string; changes: Array<{ field: string; from: unknown; to: unknown }>; detail: string | null; actorName: string }>;
};

// A 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test.describe("files, comments and history on a transaction", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ada Activity");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  const upload = async (user: TestUser, ws: string) => {
    const response = await user.api.post(`/api/workspaces/${ws}/receipts`, { multipart: { file: { name: "invoice.png", mimeType: "image/png", buffer: PNG } } });
    expect(response.status(), await response.text()).toBe(201);
    return ((await response.json()) as { key: string }).key;
  };

  test("every change is kept, files come and go, comments are shared", async () => {
    const ws = await personalWorkspaceId(owner);
    const made = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "45.00", currency: "USD", date: today(), note: "Lunch" } });
    const { transaction } = (await made.json()) as { transaction: { id: string } };
    const activity = async (user = owner) => ((await (await user.api.get(`/api/transactions/${transaction.id}/activity`)).json()) as { activity: Activity }).activity;

    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "50.00", note: "Team lunch" } })).ok()).toBe(true);
    // Saving with nothing changed adds nothing.
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { note: "Team lunch" } })).ok()).toBe(true);
    let a = await activity();
    expect(a.history.map((h) => h.action)).toEqual(["updated", "created"]);
    expect(a.history[0]!.changes).toEqual([
      { field: "amountMinor", from: 4_500, to: 5_000 },
      { field: "note", from: "Lunch", to: "Team lunch" },
    ]);
    expect(a.history[0]!.actorName).toBe("Ada Activity");

    const key = await upload(owner, ws);
    const attach = (storageKey: string) => owner.api.post(`/api/transactions/${transaction.id}/attachments`, { data: { storageKey, name: "invoice.png", contentType: "image/png", size: PNG.length } });
    expect((await attach(key)).status()).toBe(201);
    expect((await attach("000000000000000000000000/elsewhere.png")).status()).toBe(400);
    a = await activity();
    expect(a.attachments.map((f) => f.name)).toEqual(["invoice.png"]);
    expect((await owner.api.get(a.attachments[0]!.url)).ok()).toBe(true);
    const listed = (await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Array<{ attachmentCount: number }> };
    expect(listed.items[0]!.attachmentCount).toBe(1);
    expect((await owner.api.delete(`/api/transactions/${transaction.id}/attachments/${a.attachments[0]!.id}`)).ok()).toBe(true);

    expect((await owner.api.post(`/api/transactions/${transaction.id}/comments`, { data: { body: "  Split with Ravi " } })).status()).toBe(201);
    expect((await owner.api.post(`/api/transactions/${transaction.id}/comments`, { data: { body: "   " } })).status()).toBe(400);
    a = await activity();
    expect(a.comments).toEqual([expect.objectContaining({ body: "Split with Ravi", authorName: "Ada Activity", canDelete: true })]);
    expect((await owner.api.delete(`/api/comments/${a.comments[0]!.id}`)).ok()).toBe(true);

    // History outlives the transaction.
    expect((await owner.api.delete(`/api/transactions/${transaction.id}`)).ok()).toBe(true);
    a = await activity();
    expect(a.history.map((h) => h.action)).toEqual(["deleted", "attachment_removed", "attachment_added", "updated", "created"]);
  });

  test("teammates can comment but only the one who added it attaches files", async () => {
    const member = await newUser("Max Member");
    try {
      const team = await newTeam(owner, [member]);
      const made = await owner.api.post(`/api/workspaces/${team.workspaceId}/transactions`, { data: { type: "expense", amountMajor: "9.00", currency: "USD", date: today() } });
      const { transaction } = (await made.json()) as { transaction: { id: string } };
      const key = await upload(member, team.workspaceId);
      expect((await member.api.post(`/api/transactions/${transaction.id}/attachments`, { data: { storageKey: key, name: "x.png", contentType: "image/png", size: 1 } })).status()).toBe(403);
      expect((await member.api.post(`/api/transactions/${transaction.id}/comments`, { data: { body: "Was this the client lunch?" } })).status()).toBe(201);
      const seen = ((await (await member.api.get(`/api/transactions/${transaction.id}/activity`)).json()) as { activity: Activity }).activity;
      expect(seen).toMatchObject({ canEdit: false, comments: [{ authorName: "Max Member", canDelete: true }] });
      const outsider = await newUser("Olly Outsider");
      try {
        expect((await outsider.api.get(`/api/transactions/${transaction.id}/activity`)).status()).toBe(403);
      } finally {
        await disposeAll(outsider);
      }
    } finally {
      await disposeAll(member);
    }
  });

  test("open a transaction's details to attach, comment and see what changed", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const made = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "120.00", currency: "USD", date: today(), note: "Printer" } });
    const { transaction } = (await made.json()) as { transaction: { id: string } };
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "110.00" } })).ok()).toBe(true);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("button", { name: /^Details for .* Printer$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Transaction details" });
    await expect(dialog.getByRole("region", { name: "History" })).toContainText("Amount: 120.00 USD → 110.00 USD");
    await dialog.locator('input[type="file"]').setInputFiles({ name: "warranty.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByRole("link", { name: "warranty.png" })).toBeVisible();
    await dialog.getByLabel("Add a comment").fill("Warranty till 2028");
    await dialog.getByRole("button", { name: "Comment" }).click();
    await expect(dialog.getByRole("region", { name: "Comments" })).toContainText("Warranty till 2028");
    await expect(dialog.getByRole("region", { name: "History" })).toContainText("Attached warranty.png");
    await page.screenshot({ path: "test-results/transaction-details.png" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: /^Details for .* Printer$/ })).toHaveText("Details · 1");
    await context.close();
  });
});
