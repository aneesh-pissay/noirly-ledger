import { test, expect } from "@playwright/test";
import { disposeAll, newTeam, newUser, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

type Txn = { id: string; date: string; baseAmountMinor: number };

test.describe("money", () => {
  let owner: TestUser;
  let ws: string;

  test.beforeEach(async () => {
    owner = await newUser("Olive Owner");
    // A team of one: a workspace no other test writes to.
    ws = (await newTeam(owner)).workspaceId;
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  async function listAll(size: number) {
    const seen: Txn[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: String(size), ...(cursor ? { cursor } : {}) });
      const page = (await (await owner.api.get(`/api/workspaces/${ws}/transactions?${query}`)).json()) as {
        items: Txn[];
        nextCursor?: string;
      };
      seen.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return seen;
  }

  test("paging visits every transaction once, even when entered out of date order", async () => {
    const days = ["2026-05-03", "2026-01-10", "2026-05-03", "2026-07-21", "2026-02-02", "2026-05-03", "2026-03-15"];
    for (const date of days) {
      expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, {
        data: { type: "expense", amountMajor: "1.00", currency: "USD", date },
      })).ok()).toBe(true);
    }
    const all = await listAll(2);
    expect(all).toHaveLength(days.length);
    expect(new Set(all.map((t) => t.id)).size).toBe(days.length);
    expect(all.map((t) => t.date)).toEqual([...days].sort().reverse());
  });

  test("recurring: month-end day, per-date rates, and deleted occurrences stay deleted", async () => {
    const runCron = async () => {
      const res = await owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
      expect(res.ok(), await res.text()).toBe(true);
    };
    // EUR → USD at 1.00 from January, 2.00 from June.
    for (const [rate, effectiveFrom] of [["1.00", "2026-01-01"], ["2.00", "2026-06-01"]]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "EUR", rate, effectiveFrom } })).ok()).toBe(true);
    }
    const template = await owner.api.post(`/api/workspaces/${ws}/transactions`, {
      data: {
        type: "expense", amountMajor: "10.00", currency: "EUR", date: "2026-01-31",
        recurrence: { frequency: "monthly", interval: 1 }, note: "Rent",
      },
    });
    expect(template.ok(), await template.text()).toBe(true);

    await runCron();
    const posted = (await listAll(50)).filter((t) => t.date !== "2026-01-31");
    const byDate = new Map(posted.map((t) => [t.date, t]));
    // Back to the 31st after February, not stuck on the 28th.
    for (const day of ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-08-31"]) {
      expect(byDate.has(day), day).toBe(true);
    }
    expect(byDate.has("2026-03-28")).toBe(false);
    expect(byDate.get("2026-03-31")!.baseAmountMinor).toBe(1000);
    expect(byDate.get("2026-07-31")!.baseAmountMinor).toBe(2000);

    // Deleting an occurrence keeps it deleted on the next run.
    expect((await owner.api.delete(`/api/transactions/${byDate.get("2026-03-31")!.id}`)).ok()).toBe(true);
    await runCron();
    const after = await listAll(50);
    expect(after.some((t) => t.date === "2026-03-31")).toBe(false);
    expect(after.length).toBe(posted.length); // the template plus one fewer occurrence
  });

  test("simultaneous savings contributions all count", async () => {
    const { goal } = await (await owner.api.post(`/api/workspaces/${ws}/savings-goals`, {
      data: { name: "Trip", targetMajor: "100.00" },
    })).json();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => owner.api.post(`/api/savings-goals/${goal.id}`, { data: { amountMajor: "10.00" } })),
    );
    expect(results.every((r) => r.ok())).toBe(true);
    const { goals } = await (await owner.api.get(`/api/workspaces/${ws}/savings-goals`)).json();
    const saved = goals.find((g: { id: string }) => g.id === goal.id);
    expect(saved.currentAmountMinor).toBe(10000);
    expect(saved.completedAt).not.toBeNull();
  });
});
