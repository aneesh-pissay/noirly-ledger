import { test, expect } from "@playwright/test";
import { disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

/** Made by `owner` in `ws`: one of each kind of record an outsider might reach for by id. */
async function records(owner: TestUser, ws: string) {
  const post = async <T>(path: string, data: object) => {
    const res = await owner.api.post(path, { data });
    expect(res.ok(), `${path}: ${await res.text()}`).toBe(true);
    return (await res.json()) as T;
  };
  const { category } = await post<{ category: { id: string } }>(`/api/workspaces/${ws}/categories`, { name: "Private" });
  const { account } = await post<{ account: { id: string } }>(`/api/workspaces/${ws}/accounts`, { name: "Savings", kind: "bank", currency: "USD", openingMajor: "100.00", openingDate: today() });
  const { transaction } = await post<{ transaction: { id: string } }>(`/api/workspaces/${ws}/transactions`, { type: "expense", amountMajor: "9.00", currency: "USD", date: today(), categoryId: category.id });
  const { budget } = await post<{ budget: { id: string } }>(`/api/workspaces/${ws}/budgets`, { categoryId: category.id, period: "monthly", limitMajor: "50.00" });
  const { payment } = await post<{ payment: { id: string } }>(`/api/workspaces/${ws}/payments`, { name: "Rent", amountMajor: "500.00", currency: "USD", dueDate: today() });
  const { goal } = await post<{ goal: { id: string } }>(`/api/workspaces/${ws}/savings-goals`, { name: "Trip", targetMajor: "1000.00", currency: "USD" });
  return { category: category.id, account: account.id, transaction: transaction.id, budget: budget.id, payment: payment.id, goal: goal.id };
}

test.describe("workspace isolation and finer permissions", () => {
  let owner: TestUser;
  let outsider: TestUser;
  let member: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Iso Owner");
    outsider = await newUser("Out Sider");
    member = await newUser("Mem Ber");
  });

  test.afterEach(async () => {
    await disposeAll(owner, outsider, member);
  });

  test("someone outside a workspace can't read, change or point at anything in it", async () => {
    const ws = await personalWorkspaceId(owner);
    const r = await records(owner, ws);
    const denied = (status: number) => expect([403, 404]).toContain(status);

    // Reading the workspace's lists.
    for (const path of ["transactions", "categories", "accounts", "budgets", "payments", "savings-goals", "audit", "receipt-inbox", "reports/spending?from=2026-01-01&to=2026-12-31"]) {
      denied((await outsider.api.get(`/api/workspaces/${ws}/${path}`)).status());
    }
    // Reading or changing its records by id.
    denied((await outsider.api.get(`/api/transactions/${r.transaction}`)).status());
    denied((await outsider.api.get(`/api/transactions/${r.transaction}/activity`)).status());
    denied((await outsider.api.patch(`/api/transactions/${r.transaction}`, { data: { note: "mine now" } })).status());
    denied((await outsider.api.delete(`/api/transactions/${r.transaction}`)).status());
    denied((await outsider.api.patch(`/api/categories/${r.category}`, { data: { name: "Hijacked" } })).status());
    denied((await outsider.api.patch(`/api/accounts/${r.account}`, { data: { name: "Hijacked" } })).status());
    denied((await outsider.api.delete(`/api/budgets/${r.budget}`)).status());
    denied((await outsider.api.post(`/api/payments/${r.payment}/pay`, { data: { how: "mark", paidOn: today() } })).status());
    denied((await outsider.api.post(`/api/savings-goals/${r.goal}`, { data: { amountMajor: "1.00" } })).status());
    // Writing into it.
    denied((await outsider.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "1.00", currency: "USD", date: today() } })).status());

    // Pointing their own records at the owner's: refused, not linked.
    const theirs = await personalWorkspaceId(outsider);
    const into = (path: string, data: object) => outsider.api.post(`/api/workspaces/${theirs}/${path}`, { data });
    expect((await into("transactions", { type: "expense", amountMajor: "1.00", currency: "USD", date: today(), categoryId: r.category })).status()).toBe(400);
    expect((await into("transactions", { type: "expense", amountMajor: "1.00", currency: "USD", date: today(), accountId: r.account })).status()).toBe(400);
    expect((await into("budgets", { categoryId: r.category, period: "monthly", limitMajor: "5.00" })).status()).toBe(400);
    expect((await into("payments", { name: "Sneaky", amountMajor: "1.00", currency: "USD", dueDate: today(), categoryId: r.category })).status()).toBe(400);
    expect((await into("payments", { name: "Sneaky", amountMajor: "1.00", currency: "USD", dueDate: today(), accountId: r.account })).status()).toBe(400);

    // And nothing of the owner's changed.
    const { transaction } = (await (await owner.api.get(`/api/transactions/${r.transaction}`)).json()) as { transaction: { note: string | null; deletedAt?: string | null } };
    expect(transaction.note).toBeNull();
  });

  test("a custom role can be given changing others' transactions and inviting members, and only that", async () => {
    const { workspaceId: ws } = await newTeam(owner, [member]);
    const added = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "20.00", currency: "USD", date: today(), note: "owner's" } });
    expect(added.status(), await added.text()).toBe(201);
    const { transaction } = (await added.json()) as { transaction: { id: string } };

    // A plain member can't change the owner's transaction or invite anyone.
    expect((await member.api.patch(`/api/transactions/${transaction.id}`, { data: { note: "edited" } })).status()).toBe(403);
    expect((await member.api.post(`/api/workspaces/${ws}/invites`, { data: { role: "member" } })).status()).toBe(403);

    const role = await owner.api.post(`/api/workspaces/${ws}/roles`, { data: { name: "Bookkeeper", permissions: ["transaction.manage", "members.invite", "expense.submit"] } });
    expect(role.status(), await role.text()).toBeLessThan(300);
    const { role: bookkeeper } = (await role.json()) as { role: { id: string } };
    expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: member.id, role: "member", customRoleId: bookkeeper.id } })).ok()).toBe(true);

    expect((await member.api.patch(`/api/transactions/${transaction.id}`, { data: { note: "tidied" } })).ok()).toBe(true);
    expect((await member.api.post(`/api/workspaces/${ws}/invites`, { data: { role: "member" } })).ok()).toBe(true);
    // Inviting an approver is still managing members.
    expect((await member.api.post(`/api/workspaces/${ws}/invites`, { data: { role: "approver" } })).status()).toBe(403);
    // Nor do they get the integrations or the audit history.
    expect((await member.api.get(`/api/workspaces/${ws}/webhooks`)).status()).toBe(403);
    expect((await member.api.get(`/api/workspaces/${ws}/audit`)).status()).toBe(403);
  });
});
