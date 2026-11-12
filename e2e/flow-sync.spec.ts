import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";
import { FLOW_PROJECT, FLOW_READ_ONLY, FLOW_TOKEN, FLOW_WORKSPACE, startFakeFlow, type FakeTask } from "./fake-flow";

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

type Link = { tokenHint: string; openTasks: number; lastOk: boolean | null; lastResult: string | null; flowProjectName: string | null };

test.describe("bills as Noirly Flow tasks", () => {
  test.describe.configure({ mode: "serial" });
  let owner: TestUser;
  let flow: { tasks: FakeTask[]; close: () => Promise<void> };

  test.beforeAll(async () => {
    flow = await startFakeFlow();
  });

  test.afterAll(async () => {
    await flow.close();
  });

  test.beforeEach(async () => {
    owner = await newUser("Fen Flow");
    flow.tasks.length = 0;
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("bills due soon become tasks; paying one completes it, deleting one cancels it", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const url = `/api/workspaces/${ws}/flow`;
    expect(((await (await owner.api.get(url)).json()) as { configured: boolean; link: Link | null })).toMatchObject({ configured: true, link: null });

    // Only a read and write token that reaches the workspace will do.
    const link = (data: object) => owner.api.put(url, { data: { flowWorkspaceId: FLOW_WORKSPACE.id, flowProjectId: FLOW_PROJECT.id, bills: true, reminders: true, daysAhead: 7, priority: "high", ...data } });
    expect((await link({ token: "nfp_w_wrong" })).status()).toBe(400);
    expect((await link({ token: FLOW_READ_ONLY })).status()).toBe(400);
    expect((await link({ token: FLOW_TOKEN, flowWorkspaceId: "d".repeat(24) })).status()).toBe(400);
    const lookup = await owner.api.post(`${url}/lookup`, { data: { token: FLOW_TOKEN, flowWorkspaceId: FLOW_WORKSPACE.id } });
    expect(await lookup.json()).toEqual({ workspaces: [{ id: FLOW_WORKSPACE.id, name: FLOW_WORKSPACE.name }], projects: [FLOW_PROJECT] });
    const linked = await link({ token: FLOW_TOKEN });
    expect(linked.status(), await linked.text()).toBe(200);
    expect(((await linked.json()) as { link: Link }).link).toMatchObject({ tokenHint: "1234", flowProjectName: "Bills" });

    const bill = async (name: string, dueDate: string) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { name, amountMajor: "1200.00", currency: "INR", dueDate } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { payment: { id: string } }).payment.id;
    };
    const water = await bill("Water", day(2));
    const gym = await bill("Gym", day(4));
    await bill("Insurance", day(40));

    const sync = async () => {
      const res = await owner.api.post(`${url}/sync`);
      expect(res.status(), await res.text()).toBe(200);
      return ((await res.json()) as { link: Link }).link;
    };
    expect(await sync()).toMatchObject({ lastOk: true, lastResult: "Made 2, completed 0, moved 0, canceled 0", openTasks: 2 });
    expect(flow.tasks.map((t) => [t.title, t.priority, t.projectId, t.dueAt.slice(0, 10)])).toEqual([
      ["Pay Water: 1,200.00 INR", "high", FLOW_PROJECT.id, day(2)],
      ["Pay Gym: 1,200.00 INR", "high", FLOW_PROJECT.id, day(4)],
    ]);
    // Again: nothing new.
    expect((await sync()).lastResult).toBe("Made 0, completed 0, moved 0, canceled 0");

    expect((await owner.api.post(`/api/payments/${water}/pay`, { data: { how: "mark", paidOn: day(0) } })).ok()).toBe(true);
    expect((await owner.api.delete(`/api/payments/${gym}`)).ok()).toBe(true);
    expect(await sync()).toMatchObject({ lastResult: "Made 0, completed 1, moved 0, canceled 1", openTasks: 0 });
    expect(flow.tasks.map((t) => t.status)).toEqual(["done", "canceled"]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/flow");
    await expect(page.locator("[data-flow-link]")).toContainText("Linked to Home tasks · Bills");
    await expect(page.locator("[data-last-sync]")).toContainText("completed 1");
    await page.screenshot({ path: "test-results/flow-sync.png", fullPage: true });
    await context.close();

    // Unlinking keeps the tasks in Flow.
    expect((await owner.api.delete(url)).ok()).toBe(true);
    expect(flow.tasks).toHaveLength(2);
  });
});
