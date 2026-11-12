import { describe, expect, it } from "vitest";
import { missingCategories, POOL_TEMPLATE_INFO, templateSetup } from "./pool-templates";

describe("pool templates", () => {
  const members = ["a", "b", "c"];

  it("splits a trip equally and approves small spends on their own", () => {
    const setup = templateSetup("trip", 300_000, members);
    expect(setup.rules).toEqual({ autoApproveUpToMinor: 30_000 });
    expect(setup.allocation).toEqual({ mode: "equal", targetMinor: null, shares: members.map((userId) => ({ userId, value: 0 })) });
    expect(POOL_TEMPLATE_INFO.trip.needsDates).toBe(true);
  });

  it("reviews every event spend and splits nothing", () => {
    expect(templateSetup("event", 100_000, members)).toEqual({ rules: { autoApproveUpToMinor: null }, allocation: { mode: "none", targetMinor: null, shares: [] } });
  });

  it("gives each team member an even monthly share, in whole units", () => {
    const setup = templateSetup("team", 100_000, members);
    expect(setup.rules).toEqual({ autoApproveUpToMinor: 2_000, memberLimitMinor: 33_300, memberLimitPeriod: "monthly" });
    expect(setup.allocation.mode).toBe("none");
  });

  it("leaves tiny limits without auto-approval rather than at zero", () => {
    expect(templateSetup("household", 1_000, members).rules.autoApproveUpToMinor).toBeNull();
  });

  it("adds only the categories the workspace lacks", () => {
    expect(missingCategories("household", ["groceries", "Rent"]).map((c) => c.name)).toEqual(["Utilities", "Household help"]);
  });
});
