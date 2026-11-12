import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Note = { kind: string; title: string; body: string };
const channels = (overrides: Record<string, { inApp: boolean; email: boolean }> = {}) => ({
  budgets: { inApp: true, email: false },
  bills: { inApp: true, email: false },
  large: { inApp: true, email: false },
  approvals: { inApp: true, email: false },
  goals: { inApp: true, email: false },
  subscriptions: { inApp: true, email: false },
  automations: { inApp: true, email: false },
  ...overrides,
});

test.describe("notification settings and thresholds", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Nia Notify");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("your own budget levels and large-expense line; a topic turned off stays quiet", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const url = `/api/workspaces/${ws}/notification-preferences`;
    const notes = async () => ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Note[] }).notifications;

    // Defaults: everything on, two days' notice, no large-expense line.
    expect(((await (await owner.api.get(url)).json()) as { prefs: { billDaysBefore: number; largeExpenseMinor: number | null; budgetLevels: number[] } }).prefs).toMatchObject({ billDaysBefore: 2, largeExpenseMinor: null, budgetLevels: [] });
    expect((await owner.api.put(url, { data: { channels: channels(), budgetLevels: [0], billDaysBefore: 2, largeExpenseMajor: null } })).status()).toBe(400);
    const saved = await owner.api.put(url, { data: { channels: channels(), budgetLevels: [90, 50], billDaysBefore: 5, largeExpenseMajor: "200.00" } });
    expect(saved.status(), await saved.text()).toBe(200);
    expect(((await saved.json()) as { prefs: { budgetLevels: number[]; largeExpenseMinor: number } }).prefs).toMatchObject({ budgetLevels: [50, 90], largeExpenseMinor: 20_000 });

    const food = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Groceries" } })).json()) as { category: { id: string } }).category.id;
    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: food, period: "monthly", limitMajor: "100.00" } })).ok()).toBe(true);
    const spend = async (amountMajor: string, merchant: string) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date: today(), amountMajor, categoryId: food, merchant } });
      expect(res.status(), await res.text()).toBe(201);
    };

    await spend("60.00", "Market");
    await spend("35.00", "Bakery");
    const budgetNotes = (await notes()).filter((n) => n.kind === "budget.threshold").map((n) => n.title);
    expect(budgetNotes).toEqual(["Groceries at 90%", "Groceries at 50%"]);

    await spend("250.00", "Big shop");
    const large = (await notes()).find((n) => n.kind === "transaction.large");
    expect(large).toMatchObject({ title: "Large expense: 250.00 USD", body: "Big shop." });

    // Large expenses off in the app: the next one isn't listed.
    expect((await owner.api.put(url, { data: { channels: channels({ large: { inApp: false, email: false } }), budgetLevels: [50, 90], billDaysBefore: 5, largeExpenseMajor: "200.00" } })).ok()).toBe(true);
    await spend("300.00", "Another big shop");
    expect((await notes()).filter((n) => n.kind === "transaction.large")).toHaveLength(1);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/notifications");
    await expect(page.getByLabel("Budget levels")).toHaveValue("50, 90");
    await expect(page.getByLabel("Bill notice")).toHaveValue("5");
    await expect(page.getByLabel("Large expenses in Ledger")).not.toBeChecked();
    await page.getByLabel("Large expense amount").fill("");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved");
    expect(((await (await owner.api.get(url)).json()) as { prefs: { largeExpenseMinor: number | null } }).prefs.largeExpenseMinor).toBeNull();
    await page.screenshot({ path: "test-results/notification-settings.png", fullPage: true });
    await context.close();
  });
});
