import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today } from "./fixtures";

test.describe("team permissions and FX", () => {
  test("members cannot approve and owners can", async ({ browser }) => {
    const owner = await newUser("Olive Owner");
    const member = await newUser("Milo Member");
    const { workspaceId, poolId } = await newTeam(owner, [member]);

    const memberCtx = await browserAs(browser, member);
    const memberPage = await memberCtx.newPage();
    await memberPage.goto(`/w/${workspaceId}`);
    await expect(memberPage.getByText("TEAM · MEMBER")).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "Approvals" })).toHaveCount(0);

    const submit = await member.api.post(`/api/workspaces/${workspaceId}/expenses`, {
      data: { budgetPoolId: poolId, amountMajor: "12.00", currency: "USD", date: today(), note: "E2E taxi" },
    });
    expect(submit.ok(), await submit.text()).toBeTruthy();
    const submitted = (await submit.json()) as { approval: { id: string } };

    expect((await member.api.post(`/api/approvals/${submitted.approval.id}/decide`, { data: { decision: "approved" } })).status()).toBe(403);
    const approved = await owner.api.post(`/api/approvals/${submitted.approval.id}/decide`, { data: { decision: "approved" } });
    expect(approved.ok(), await approved.text()).toBeTruthy();
    await memberCtx.close();
    await disposeAll(owner, member);
  });

  test("FX settings show user-set rates", async ({ browser }) => {
    const owner = await newUser("Olive Owner");
    const personal = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${personal}/fx-rates`, { data: { currency: "EUR", rate: "1.10" } })).ok()).toBe(true);

    const ownerCtx = await browserAs(browser, owner);
    const page = await ownerCtx.newPage();
    await page.goto("/settings/currency");
    await expect(page.getByRole("heading", { name: "Currency" })).toBeVisible();
    await expect(page.getByText(/user-set/i)).toBeVisible();
    // The saved rate's row (the currency picker lists EUR too).
    await expect(page.locator("ul").getByText("EUR", { exact: true })).toBeVisible();
    await ownerCtx.close();
    await disposeAll(owner);
  });

  test("an approver sees their own expense as waiting, not as theirs to approve", async ({ browser }) => {
    const owner = await newUser("Olive Owner");
    const approver = await newUser("Ada Approver");
    const { workspaceId, poolId } = await newTeam(owner, [approver], "approver");
    expect((await approver.api.post(`/api/workspaces/${workspaceId}/expenses`, {
      data: { budgetPoolId: poolId, amountMajor: "30.00", currency: "USD", date: today(), note: "My own lunch" },
    })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${workspaceId}/expenses`, {
      data: { budgetPoolId: poolId, amountMajor: "8.00", currency: "USD", date: today(), note: "Owner coffee" },
    })).ok()).toBe(true);

    const ctx = await browserAs(browser, approver);
    const page = await ctx.newPage();
    await page.goto(`/w/${workspaceId}/approvals`);
    const own = page.locator("li", { hasText: "My own lunch" });
    await expect(own.getByText("waiting for another approver")).toBeVisible();
    await expect(own.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.locator("li", { hasText: "Owner coffee" }).getByRole("button", { name: "Approve" })).toBeVisible();
    await ctx.close();
    await disposeAll(owner, approver);
  });
});
