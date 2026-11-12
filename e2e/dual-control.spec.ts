import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, type TestUser } from "./fixtures";

type Pending = { id: string; kind: string; status: string; canDecide: boolean; canCancel: boolean; summary: string };
type State = { enabled: boolean; owners: number; actions: Pending[] };

test.describe("two-person approval for sensitive changes", () => {
  let owner: TestUser;
  let coOwner: TestUser;
  let third: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Own Er");
    coOwner = await newUser("Co Owner");
    third = await newUser("Thi Rd");
  });

  test.afterEach(async () => {
    await disposeAll(owner, coOwner, third);
  });

  test("a second owner agrees or turns down; the one who asked can't decide their own", async ({ browser }) => {
    const { workspaceId: ws } = await newTeam(owner, [coOwner, third]);
    const state = async (user: TestUser) => (await (await user.api.get(`/api/workspaces/${ws}/pending-actions`)).json()) as State;
    const setRole = (by: TestUser, user: TestUser, role: string) => by.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: user.id, role } });
    const roleOf = async (user: TestUser) => ((await (await owner.api.get(`/api/workspaces/${ws}/members`)).json()) as { members: Array<{ userId: string; role: string }> }).members.find((m) => m.userId === user.id)?.role;

    // One owner: nobody to share it with.
    expect((await owner.api.put(`/api/workspaces/${ws}/pending-actions`, { data: { enabled: true } })).status()).toBe(400);
    expect((await setRole(owner, coOwner, "owner")).ok()).toBe(true);
    expect((await owner.api.put(`/api/workspaces/${ws}/pending-actions`, { data: { enabled: true } })).ok()).toBe(true);
    expect(await state(owner)).toMatchObject({ enabled: true, owners: 2 });

    // Making someone an approver now waits.
    const held = await setRole(owner, third, "approver");
    expect(held.status()).toBe(409);
    expect((await held.json()).error).toBe("needs_second_approval");
    expect(await roleOf(third)).toBe("member");
    // Asking again doesn't make a second request.
    expect((await setRole(owner, third, "approver")).status()).toBe(409);
    const [request] = (await state(owner)).actions;
    expect((await state(owner)).actions).toHaveLength(1);
    expect(request).toMatchObject({ kind: "member.role", status: "pending", canDecide: false, canCancel: true });
    expect((await state(coOwner)).actions[0]).toMatchObject({ canDecide: true, canCancel: false });
    // Not by whoever asked, nor by someone who isn't an owner.
    expect((await owner.api.post(`/api/pending-actions/${request!.id}`, { data: { decision: "approve" } })).status()).toBe(403);
    expect((await third.api.post(`/api/pending-actions/${request!.id}`, { data: { decision: "approve" } })).status()).toBe(403);
    expect(await (await coOwner.api.post(`/api/pending-actions/${request!.id}`, { data: { decision: "approve" } })).json()).toEqual({ status: "approved", result: null });
    expect(await roleOf(third)).toBe("approver");
    // Decided once.
    expect((await coOwner.api.post(`/api/pending-actions/${request!.id}`, { data: { decision: "approve" } })).status()).toBe(409);

    // An approval rule, turned down: nothing changes.
    const rule = await owner.api.post(`/api/workspaces/${ws}/approval-rules`, { data: { name: "Big spends", minMajor: "1000.00", steps: [{ kind: "owners" }] } });
    expect(rule.status()).toBe(409);
    const ruleRequest = (await state(coOwner)).actions.find((a) => a.kind === "approval_rule.create")!;
    expect((await coOwner.api.post(`/api/pending-actions/${ruleRequest.id}`, { data: { decision: "reject" } })).ok()).toBe(true);
    expect(((await (await owner.api.get(`/api/workspaces/${ws}/approval-rules`)).json()) as { rules: unknown[] }).rules).toEqual([]);

    // Whoever asked can take a request back.
    expect((await setRole(owner, third, "member")).status()).toBe(409);
    const take = (await state(owner)).actions.find((a) => a.status === "pending")!;
    expect((await owner.api.delete(`/api/pending-actions/${take.id}`)).ok()).toBe(true);
    expect((await state(owner)).actions.find((a) => a.id === take.id)?.status).toBe("cancelled");

    // Every step is in the audit history.
    const { entries } = (await (await owner.api.get(`/api/workspaces/${ws}/audit?entity=workspace`)).json()) as { entries: Array<{ action: string }> };
    expect(entries.map((e) => e.action)).toEqual(expect.arrayContaining(["workspace.dual_control_on", "workspace.second_approval_requested", "workspace.second_approval_given", "workspace.second_approval_refused"]));

    const context = await browserAs(browser, coOwner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/members`);
    await expect(page.getByLabel("Ask a second owner to agree to sensitive changes")).toBeChecked();
    await expect(page.locator('[data-decided="approved"]')).toContainText("agreed and made by Co Owner");
    await page.screenshot({ path: "test-results/dual-control.png", fullPage: true });
    await context.close();
  });

  test("turning it off and deleting the workspace both take a second owner", async () => {
    const { workspaceId: ws } = await newTeam(owner, [coOwner]);
    expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: coOwner.id, role: "owner" } })).ok()).toBe(true);
    expect((await owner.api.put(`/api/workspaces/${ws}/pending-actions`, { data: { enabled: true } })).ok()).toBe(true);
    const pending = async () => ((await (await coOwner.api.get(`/api/workspaces/${ws}/pending-actions`)).json()) as State).actions.filter((a) => a.status === "pending");

    expect((await owner.api.put(`/api/workspaces/${ws}/pending-actions`, { data: { enabled: false } })).status()).toBe(409);
    const off = (await pending())[0]!;
    expect(off.kind).toBe("dual_control.off");
    expect((await coOwner.api.post(`/api/pending-actions/${off.id}`, { data: { decision: "approve" } })).ok()).toBe(true);
    expect(((await (await owner.api.get(`/api/workspaces/${ws}/pending-actions`)).json()) as State).enabled).toBe(false);

    expect((await owner.api.put(`/api/workspaces/${ws}/pending-actions`, { data: { enabled: true } })).ok()).toBe(true);
    const name = ((await (await owner.api.get("/api/workspaces")).json()) as { workspaces: Array<{ id: string; name: string }> }).workspaces.find((w) => w.id === ws)!.name;
    expect((await owner.api.delete(`/api/workspaces/${ws}`, { data: { confirmName: name } })).status()).toBe(409);
    const del = (await pending())[0]!;
    expect(del.kind).toBe("workspace.delete");
    expect(await (await coOwner.api.post(`/api/pending-actions/${del.id}`, { data: { decision: "approve" } })).json()).toEqual({ status: "approved", result: null });
    const left = ((await (await owner.api.get("/api/workspaces")).json()) as { workspaces: Array<{ id: string }> }).workspaces.map((w) => w.id);
    expect(left).not.toContain(ws);
    const notes = ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications;
    expect(notes.some((n) => n.title.startsWith("Co Owner agreed"))).toBe(true);
  });
});
