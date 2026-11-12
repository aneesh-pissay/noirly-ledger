import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";

type Department = { id: string; name: string; spentMinor: number; state: string; remainingMinor: number | null };

test.describe("department, team and project budgets", () => {
  let owner: TestUser;
  let mel: TestUser;
  let ben: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    mel = await newUser("Mel Member");
    ben = await newUser("Ben Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel, ben);
  });

  test("a team's spending counts toward its department; budgets alert; expenses default to your team", async () => {
    const { workspaceId: ws, poolId } = await newTeam(owner, [mel, ben]);
    const add = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/departments`, { data });
    const created = await add({ name: "Engineering", budgetMajor: "100.00", period: "monthly" });
    expect(created.status(), await created.text()).toBe(201);
    const eng = ((await created.json()) as { department: { id: string } }).department.id;
    const web = ((await (await add({ name: "Web", parentId: eng, budgetMajor: "50.00", memberIds: [mel.id] })).json()) as { department: { id: string } }).department.id;
    // One level only, and members can't set them up.
    expect((await add({ name: "Frontend", parentId: web })).status()).toBe(400);
    expect((await mel.api.post(`/api/workspaces/${ws}/departments`, { data: { name: "Mine" } })).status()).toBe(403);

    const submit = async (user: TestUser, amountMajor: string, extra: Record<string, unknown> = {}) => {
      const res = await user.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor, currency: "USD", date: today(), ...extra } });
      expect(res.ok(), await res.text()).toBe(true);
      const body = (await res.json()) as { approval: { id: string }; transaction: { departmentId: string | null } };
      expect((await owner.api.post(`/api/approvals/${body.approval.id}/decide`, { data: { decision: "approved" } })).ok()).toBe(true);
      return body.transaction;
    };
    const list = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/departments`)).json()) as { departments: Department[] }).departments;
    const titles = async () => ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications.map((n) => n.title);

    // Mel is on Web, so her expense goes there without asking.
    expect((await submit(mel, "45.00")).departmentId).toBe(web);
    let depts = await list();
    expect(depts.find((d) => d.id === web)).toMatchObject({ spentMinor: 4500, state: "near", remainingMinor: 500 });
    expect(depts.find((d) => d.id === eng)).toMatchObject({ spentMinor: 4500, state: "ok" });
    expect(await titles()).toContain("Web reached 80% of its budget");

    // Ben is on no team: his goes nowhere unless he picks one.
    expect((await submit(ben, "5.00")).departmentId).toBeNull();
    await submit(ben, "70.00", { departmentId: eng });
    depts = await list();
    expect(depts.find((d) => d.id === eng)).toMatchObject({ spentMinor: 11500, state: "over", remainingMinor: -1500 });
    expect(await titles()).toContain("Engineering is over budget");

    // A department with teams or spending can't be deleted; it can be archived.
    expect((await owner.api.delete(`/api/workspaces/${ws}/departments/${eng}`)).status()).toBe(409);
    expect((await owner.api.patch(`/api/workspaces/${ws}/departments/${web}`, { data: { archived: true } })).ok()).toBe(true);
    const res = await mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor: "1.00", currency: "USD", date: today(), departmentId: web } });
    expect(res.status()).toBe(400);
  });

  test("a project's budget runs for its whole life", async () => {
    const { workspaceId: ws, poolId } = await newTeam(owner, [mel]);
    const project = ((await (await owner.api.post(`/api/workspaces/${ws}/projects`, { data: { name: "Offsite" } })).json()) as { project: { id: string } }).project;
    expect((await owner.api.patch(`/api/projects/${project.id}`, { data: { budgetMajor: "30.00" } })).ok()).toBe(true);
    const res = await mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor: "40.00", currency: "USD", date: today(), projectId: project.id } });
    expect(res.ok(), await res.text()).toBe(true);
    const { approval } = (await res.json()) as { approval: { id: string } };
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).ok()).toBe(true);
    const { projects } = (await (await owner.api.get(`/api/workspaces/${ws}/projects`)).json()) as { projects: Array<{ id: string; spentMinor: number; budgetMinor: number | null }> };
    expect(projects.find((p) => p.id === project.id)).toMatchObject({ spentMinor: 4000, budgetMinor: 3000 });
    const notes = ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications;
    expect(notes.some((n) => n.title === "Offsite is over budget")).toBe(true);
  });

  test("set up a department on its page", async ({ browser }) => {
    const { workspaceId: ws } = await newTeam(owner, [mel]);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/departments`);
    const form = page.getByRole("form", { name: "New department" });
    await form.getByLabel("Department name").fill("Sales");
    await form.getByLabel("Budget (USD)").fill("500");
    await form.getByLabel("Budget period").selectOption({ label: "a quarter" });
    await form.getByLabel("Mel Member").check();
    await form.getByRole("button", { name: "Add" }).click();
    const sales = page.locator('[data-department="Sales"]');
    await expect(sales).toContainText("a quarter");
    await expect(sales).toContainText("Mel Member");
    await page.screenshot({ path: "test-results/departments.png", fullPage: true });
    await context.close();
  });
});
