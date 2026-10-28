import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, type TestUser } from "./fixtures";

type Role = { id: string; name: string; permissions: string[]; memberCount: number };
type Member = { displayName: string; role: string; customRoleId: string | null; customRoleName: string | null };

test.describe("custom roles", () => {
  let owner: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel);
  });

  test("a role with exactly the permissions it lists, given to a member and taken back", async () => {
    const { workspaceId: ws } = await newTeam(owner, [mel]);
    const addCategory = (name: string) => mel.api.post(`/api/workspaces/${ws}/categories`, { data: { name } });
    const addPool = () => mel.api.post(`/api/workspaces/${ws}/budget-pools`, { data: { name: "Ops 2", limitMajor: "100.00" } });
    // A plain member can't change categories, and can't make roles.
    expect((await addCategory("Software")).status()).toBe(403);
    expect((await mel.api.post(`/api/workspaces/${ws}/roles`, { data: { name: "Mine", permissions: ["budget.manage"] } })).status()).toBe(403);

    // Running members stays with owners, even when asked for.
    const created = await owner.api.post(`/api/workspaces/${ws}/roles`, { data: { name: "Bookkeeper", permissions: ["budget.manage", "report.export", "members.manage"] } });
    expect(created.status(), await created.text()).toBe(201);
    const { role } = (await created.json()) as { role: Role };
    expect(role.permissions).toEqual(["workspace.read", "budget.manage", "report.export"]);
    expect((await owner.api.post(`/api/workspaces/${ws}/roles`, { data: { name: "bookkeeper", permissions: [] } })).status()).toBe(409);

    const melId = ((await (await owner.api.get(`/api/workspaces/${ws}/members`)).json()) as { members: Array<Member & { userId: string }> }).members.find((m) => m.displayName === "Mel Member")!.userId;
    expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: melId, role: "member", customRoleId: role.id } })).ok()).toBe(true);
    const members = ((await (await owner.api.get(`/api/workspaces/${ws}/members`)).json()) as { members: Member[] }).members;
    expect(members.find((m) => m.displayName === "Mel Member")).toMatchObject({ role: "member", customRoleName: "Bookkeeper" });

    // Now Mel can do what the role lists, and still not what it doesn't.
    expect((await addCategory("Software")).status()).toBe(201);
    expect((await addPool()).status()).toBe(403);

    // Changing the role changes what its members can do at once.
    expect((await owner.api.patch(`/api/workspaces/${ws}/roles/${role.id}`, { data: { permissions: ["budget.manage", "pool.manage"] } })).ok()).toBe(true);
    expect((await addPool()).status()).toBe(201);

    // Deleting it puts Mel back on the built-in member role.
    expect((await owner.api.delete(`/api/workspaces/${ws}/roles/${role.id}`)).ok()).toBe(true);
    expect((await addCategory("Travel")).status()).toBe(403);
  });

  test("set up a role on the members page; its member then sees Approvals", async ({ browser }) => {
    const { workspaceId: ws } = await newTeam(owner, [mel]);
    const ownerContext = await browserAs(browser, owner);
    const page = await ownerContext.newPage();
    await page.goto(`/w/${ws}/members`);
    const roles = page.getByRole("region", { name: "Roles" });
    await roles.getByLabel("Role name").fill("Finance lead");
    await roles.getByLabel("New role: Approve or reject expenses").check();
    await roles.getByRole("button", { name: "Add role" }).click();
    await expect(roles.locator('[data-role="Finance lead"]')).toContainText("0 members");
    await page.getByLabel("Role of Mel Member").selectOption({ label: "Finance lead" });
    await expect(roles.locator('[data-role="Finance lead"]')).toContainText("1 member");
    await page.screenshot({ path: "test-results/custom-roles.png", fullPage: true });
    await ownerContext.close();

    // Mel, a member by built-in role, now decides expenses: the menu shows Approvals.
    const melContext = await browserAs(browser, mel);
    const melPage = await melContext.newPage();
    await melPage.goto(`/w/${ws}`);
    await expect(melPage.getByRole("link", { name: "Approvals" })).toBeVisible();
    await melContext.close();
  });
});
