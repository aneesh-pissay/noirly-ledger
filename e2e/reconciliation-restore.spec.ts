import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Account = { id: string; name: string; numberMasked: string | null; reconciledThrough: string | null };
type Txn = { id: string; note: string | null; accountId: string | null; clearing: string };
type Report = {
  accounts: Array<{ name: string; status: string; driftMinor: number | null; lateCount: number; pendingCount: number; stalePendingCount: number; unreconciledCount: number }>;
  history: Array<{ accountName: string; through: string; statementMinor: number; transactionCount: number; by: string | null }>;
};
type Restored = { workspaceId: string; name: string; counts: Record<string, number>; skipped: string[]; membersLeftOut: number };

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test.describe("reconciliation reports and backup restore", () => {
  let owner: TestUser;
  let member: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Rhea Recon");
    member = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, member);
  });

  test("the report shows what changed since an account was reconciled", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Checking", kind: "bank", currency: "USD", openingMajor: "1000.00", openingDate: daysAgo(60) } })).json()) as { account: Account };
    const txn = async (data: object) => {
      const response = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", accountId: account.id, ...data } });
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { transaction: Txn }).transaction;
    };
    const report = async () => (await (await owner.api.get(`/api/workspaces/${ws}/reconciliation`)).json()) as Report;

    expect((await report()).accounts[0]).toMatchObject({ name: "Checking", status: "never" });
    const rent = await txn({ amountMajor: "300.00", date: daysAgo(10) });
    await txn({ amountMajor: "20.00", date: daysAgo(30), clearing: "pending" });
    expect((await owner.api.post(`/api/accounts/${account.id}/reconcile`, { data: { statementMajor: "700.00", through: daysAgo(5) } })).ok()).toBe(true);
    expect((await report()).accounts[0]).toMatchObject({ status: "ok", driftMinor: 0, lateCount: 0, pendingCount: 1, stalePendingCount: 1 });
    expect((await report()).history).toEqual([{ accountName: "Checking", through: daysAgo(5), statementMinor: 70_000, transactionCount: 1, by: "Rhea Recon", id: expect.any(String), accountId: account.id, currency: "USD", at: expect.any(String) }]);

    // Added afterwards, but dated inside the reconciled period.
    await txn({ amountMajor: "15.00", date: daysAgo(7) });
    expect((await report()).accounts[0]).toMatchObject({ status: "drift", lateCount: 1, driftMinor: 0, unreconciledCount: 1 });
    // A reconciled one taken back to cleared: what's reconciled no longer adds up to the statement.
    expect((await owner.api.patch(`/api/transactions/${rent.id}`, { data: { clearing: "cleared" } })).ok()).toBe(true);
    expect((await report()).accounts[0]).toMatchObject({ status: "drift", driftMinor: 30_000 });

    const csv = await owner.api.get(`/api/workspaces/${ws}/reconciliation?format=csv`);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain("Checking,USD,Doesn't add up");
    // Reconciling is in the audit history.
    const audit = (await (await owner.api.get(`/api/workspaces/${ws}/audit?entity=account`)).json()) as { entries: Array<{ action: string }> };
    expect(audit.entries.map((e) => e.action)).toContain("account.reconciled");

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    await page.getByRole("link", { name: "Reconciliation report" }).click();
    await expect(page.locator('[data-account="Checking"][data-status="drift"]')).toContainText("1 added since");
    await expect(page.locator('[data-reconciliation="Checking"]')).toContainText("Rhea Recon");
    await page.screenshot({ path: "test-results/reconciliation-report.png", fullPage: true });
    await context.close();
  });

  test("a backup restores as a new workspace with new ids; the original is untouched", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Savings", kind: "bank", currency: "USD", openingMajor: "500.00", openingDate: today(), number: "50100123456789" } })).json()) as { account: Account };
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "40.00", currency: "USD", date: today(), accountId: account.id, note: "Groceries for Diwali" } })).status()).toBe(201);
    expect((await owner.api.post(`/api/accounts/${account.id}/reconcile`, { data: { statementMajor: "460.00", through: today() } })).ok()).toBe(true);
    const made = await owner.api.post(`/api/workspaces/${ws}/backups/run`);
    expect(made.status(), await made.text()).toBe(201);
    const { backup } = (await made.json()) as { backup: { id: string } };

    const res = await owner.api.post(`/api/workspaces/${ws}/backups/${backup.id}/restore`);
    expect(res.status(), await res.text()).toBe(201);
    const { restored } = (await res.json()) as { restored: Restored };
    expect(restored).toMatchObject({ name: "Personal (restored)", membersLeftOut: 0 });
    expect(restored.counts).toMatchObject({ accounts: 1, transactions: 1, reconciliations: 1 });
    expect(restored.skipped).toContain("auditEntries");
    const copy = restored.workspaceId;
    expect(copy).not.toBe(ws);

    const accounts = ((await (await owner.api.get(`/api/workspaces/${copy}/accounts`)).json()) as { accounts: Account[] }).accounts;
    expect(accounts).toEqual([expect.objectContaining({ name: "Savings", numberMasked: null, reconciledThrough: today() })]);
    expect(accounts[0]!.id).not.toBe(account.id);
    // Notes come back sealed and searchable, pointing at the new account.
    const found = ((await (await owner.api.get(`/api/workspaces/${copy}/transactions?q=diwali`)).json()) as { items: Txn[] }).items;
    expect(found).toEqual([expect.objectContaining({ note: "Groceries for Diwali", accountId: accounts[0]!.id, clearing: "reconciled" })]);
    // And the copy's reconciliation report agrees with itself.
    expect(((await (await owner.api.get(`/api/workspaces/${copy}/reconciliation`)).json()) as Report).accounts[0]).toMatchObject({ status: "ok", driftMinor: 0 });

    // The original is as it was; both histories say what happened.
    expect(((await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Txn[] }).items).toHaveLength(1);
    const actions = async (id: string) => ((await (await owner.api.get(`/api/workspaces/${id}/audit?entity=workspace`)).json()) as { entries: Array<{ action: string }> }).entries.map((e) => e.action);
    expect(await actions(copy)).toEqual(["workspace.restored"]);
    expect(await actions(ws)).toContain("workspace.backup_restored");
    expect(((await (await owner.api.get(`/api/workspaces/${copy}/audit/verify`)).json()) as { ok: boolean }).ok).toBe(true);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/backups");
    await page.getByRole("button", { name: "Restore", exact: true }).first().click();
    await page.getByRole("button", { name: "Yes, restore" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Personal (restored)" })).toBeVisible();
    await page.screenshot({ path: "test-results/backup-restore.png", fullPage: true });
    await context.close();
  });

  test("an uploaded export restores for the uploader; other files and other people are refused", async ({ browser }) => {
    const { workspaceId } = await newTeam(owner, [member]);
    expect((await owner.api.post(`/api/workspaces/${workspaceId}/transactions`, { data: { type: "expense", amountMajor: "9.00", currency: "USD", date: today(), note: "Team lunch" } })).status()).toBe(201);
    const exported = await (await owner.api.get(`/api/workspaces/${workspaceId}/export?format=json`)).body();
    const backup = (await (await owner.api.post(`/api/workspaces/${workspaceId}/backups/run`)).json()) as { backup: { id: string } };

    // A member can't restore the team's backups.
    expect((await member.api.post(`/api/workspaces/${workspaceId}/backups/${backup.backup.id}/restore`)).status()).toBe(403);
    const upload = (by: TestUser, data: Buffer) => by.api.post("/api/workspaces/restore", { data, headers: { "content-type": "application/octet-stream" } });
    const junk = await upload(owner, Buffer.from('{"hello":"world"}'));
    expect(junk.status()).toBe(422);
    expect((await junk.json()).message).toBe("This isn't a Noirly Ledger export or backup");

    const res = await upload(member, exported);
    expect(res.status(), await res.text()).toBe(201);
    const { restored } = (await res.json()) as { restored: Restored };
    expect(restored.membersLeftOut).toBe(1);
    const mine = ((await (await member.api.get("/api/workspaces")).json()) as { workspaces: Array<{ id: string; role: string }> }).workspaces;
    expect(mine.find((w) => w.id === restored.workspaceId)).toMatchObject({ role: "owner" });
    const notes = ((await (await member.api.get(`/api/workspaces/${restored.workspaceId}/transactions`)).json()) as { items: Txn[] }).items.map((t) => t.note);
    expect(notes).toEqual(["Team lunch"]);
    // The owner of the original isn't in the copy.
    expect((await owner.api.get(`/api/workspaces/${restored.workspaceId}/transactions`)).status()).toBe(403);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/backups");
    await page.getByLabel("Export or backup file").setInputFiles({ name: "export.json", mimeType: "application/json", buffer: exported });
    await expect(page.getByRole("status").filter({ hasText: "(restored)" })).toBeVisible();
    await context.close();
  });
});
