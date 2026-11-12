import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type State = {
  started: boolean;
  readyToAssignMinor: number;
  uncategorizedSpentMinor: number;
  envelopes: Array<{ categoryId: string; fundedMinor: number; spentMinor: number; balanceMinor: number }>;
};

test.describe("envelopes", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Eve Envelope");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("money moves into envelopes and spending comes out of them", async () => {
    const ws = await personalWorkspaceId(owner);
    const get = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/envelopes`)).json()) as { envelopes: State }).envelopes;
    expect((await get()).started).toBe(false);
    const move = (fromCategoryId: string | null, toCategoryId: string | null, amountMajor: string) =>
      owner.api.post(`/api/workspaces/${ws}/envelopes/moves`, { data: { fromCategoryId, toCategoryId, amountMajor } });
    expect((await move(null, null, "1.00")).status()).toBe(409);

    const account = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { currency: "USD", openingDate: today(), ...data } })).json()) as { account: { id: string } }).account.id;
    const bank = await account({ name: "Checking", kind: "bank", openingMajor: "1000.00" });
    const card = await account({ name: "Visa", kind: "credit_card", openingMajor: "0" });
    const category = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data })).json()) as { category: { id: string } }).category.id;
    const food = await category({ name: "Food" });
    const fun = await category({ name: "Fun" });
    const games = await category({ name: "Games", parentId: fun });
    expect((await owner.api.put(`/api/workspaces/${ws}/envelopes`, { data: { since: today() } })).ok()).toBe(true);

    const envelope = async (id: string) => (await get()).envelopes.find((e) => e.categoryId === id)!;
    expect((await get()).readyToAssignMinor).toBe(100_000);
    expect((await get()).envelopes.some((e) => e.categoryId === games)).toBe(false);
    expect((await move(null, food, "300.00")).status()).toBe(201);
    expect((await move(null, fun, "200.00")).status()).toBe(201);
    expect((await get()).readyToAssignMinor).toBe(50_000);
    const tooMuch = await move(null, food, "600.00");
    expect(tooMuch.status()).toBe(400);
    expect((await tooMuch.json()).message).toBe("That's more than is ready to assign");

    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { currency: "USD", date: today(), type: "expense", ...data } });
    // Spending from the bank or on a card comes out of the envelope, not Ready to assign.
    expect((await txn({ amountMajor: "50.00", categoryId: food, accountId: bank })).status()).toBe(201);
    expect((await txn({ amountMajor: "40.00", categoryId: fun, accountId: card })).status()).toBe(201);
    // A subcategory spends from its parent's envelope.
    expect((await txn({ amountMajor: "10.00", categoryId: games, accountId: bank })).status()).toBe(201);
    expect(await envelope(food)).toMatchObject({ fundedMinor: 30_000, spentMinor: 5_000, balanceMinor: 25_000 });
    expect(await envelope(fun)).toMatchObject({ spentMinor: 5_000, balanceMinor: 15_000 });
    expect((await get()).readyToAssignMinor).toBe(50_000);

    // Income adds to Ready to assign; spending with no category takes from it.
    expect((await txn({ type: "income", amountMajor: "100.00", accountId: bank })).status()).toBe(201);
    expect((await txn({ amountMajor: "20.00", accountId: bank })).status()).toBe(201);
    expect(await get()).toMatchObject({ readyToAssignMinor: 58_000, uncategorizedSpentMinor: 2_000 });

    // Between envelopes, and back, never more than an envelope holds.
    expect((await move(food, fun, "100.00")).status()).toBe(201);
    expect((await move(food, null, "150.00")).status()).toBe(201);
    expect(await envelope(food)).toMatchObject({ balanceMinor: 0 });
    expect((await move(food, fun, "0.01")).status()).toBe(400);
    expect((await move(fun, fun, "1.00")).status()).toBe(400);
    expect((await move(null, games, "1.00")).status()).toBe(400);
    expect((await get()).readyToAssignMinor).toBe(73_000);

    const member = await newUser("Max Member");
    try {
      const team = await newTeam(owner, [member]);
      expect((await member.api.put(`/api/workspaces/${team.workspaceId}/envelopes`, { data: { since: today() } })).status()).toBe(403);
    } finally {
      await disposeAll(member);
    }
  });

  test("start envelopes and fill one in the app", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Checking", kind: "bank", currency: "USD", openingMajor: "800.00", openingDate: today() } })).status()).toBe(201);
    expect((await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Groceries" } })).status()).toBe(201);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/envelopes");
    await page.getByRole("button", { name: "Start using envelopes" }).click();
    await expect(page.getByText("Ready to assign").first()).toBeVisible();
    await expect(page.getByText("800.00 USD").first()).toBeVisible();
    const groceries = page.locator('[data-envelope="Groceries"]');
    await groceries.getByRole("button", { name: "Fill" }).click();
    const form = page.getByRole("form", { name: "Move money" });
    await expect(form.getByLabel("To")).toHaveValue(/[a-f0-9]{24}/);
    await form.getByLabel(/Amount/).fill("250");
    await form.getByLabel("Note (optional)").fill("Weekly shop");
    await form.getByRole("button", { name: "Move" }).click();
    await expect(groceries).toContainText("250.00 USD");
    await expect(page.getByText("550.00 USD").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Recent moves" })).toContainText("Ready to assign → Groceries · Weekly shop");
    await page.screenshot({ path: "test-results/envelopes.png", fullPage: true });
    await context.close();
  });
});
