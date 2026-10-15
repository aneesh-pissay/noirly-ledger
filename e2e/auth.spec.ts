import { test, expect } from "@playwright/test";

test("unauthenticated visitors land on login", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: /continue with noirly/i })).toBeVisible();
});

test("health endpoint is public", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
});
