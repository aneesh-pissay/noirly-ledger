import { describe, expect, it } from "vitest";
import { budgetState, crossedLine, defaultDepartmentFor, groupPeriodWindow, parentProblem, rollUp, withTeams, type DepartmentNode } from "./group-budgets";

const at = new Date("2026-10-31T10:00:00Z");

describe("group budget periods", () => {
  it("runs months, and quarters and years from the financial year's start", () => {
    expect(groupPeriodWindow("monthly", at)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    // Indian financial year: April to March; October is in Q3 (Oct–Dec).
    expect(groupPeriodWindow("quarterly", at, 4)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(groupPeriodWindow("yearly", at, 4)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(groupPeriodWindow("quarterly", new Date("2027-02-10T00:00:00Z"), 4)).toEqual({ from: "2027-01-01", to: "2027-03-31" });
    expect(groupPeriodWindow("quarterly", at)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(groupPeriodWindow("yearly", new Date("2026-02-01T00:00:00Z"), 4)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
});

describe("budget state", () => {
  it("is near from the alert line and over past the budget", () => {
    expect(budgetState(500, null, 80).state).toBe("none");
    expect(budgetState(700, 1000, 80)).toEqual({ state: "ok", remainingMinor: 300, pct: 70 });
    expect(budgetState(800, 1000, 80).state).toBe("near");
    expect(budgetState(1000, 1000, 80).state).toBe("near");
    expect(budgetState(1200, 1000, 80)).toEqual({ state: "over", remainingMinor: -200, pct: 120 });
  });

  it("says when spend crosses the alert line or the budget, once", () => {
    expect(crossedLine(700, 850, 1000, 80)).toBe("alert");
    expect(crossedLine(850, 900, 1000, 80)).toBeNull();
    expect(crossedLine(900, 1100, 1000, 80)).toBe("over");
    expect(crossedLine(100, 1100, 1000, 80)).toBe("over");
    expect(crossedLine(1100, 1200, 1000, 80)).toBeNull();
    expect(crossedLine(0, 100, null, 80)).toBeNull();
  });
});

describe("departments and teams", () => {
  const depts: DepartmentNode[] = [
    { id: "eng", parentId: null, memberIds: ["ada"], archived: false },
    { id: "web", parentId: "eng", memberIds: ["mel", "ben"], archived: false },
    { id: "app", parentId: "eng", memberIds: ["ben"], archived: false },
    { id: "ops", parentId: null, memberIds: ["sam", "ada"], archived: false },
  ];

  it("adds a department's teams' spending into its own", () => {
    const totals = rollUp(depts, new Map([["eng", 100], ["web", 50], ["app", 25], ["ops", 10]]));
    expect(Object.fromEntries(totals)).toEqual({ eng: 175, web: 50, app: 25, ops: 10 });
    expect(withTeams(depts, "eng")).toEqual(["eng", "web", "app"]);
  });

  it("defaults to someone's one team, else their one department", () => {
    expect(defaultDepartmentFor(depts, "mel")).toBe("web");
    expect(defaultDepartmentFor(depts, "ben")).toBeNull();
    expect(defaultDepartmentFor(depts, "sam")).toBe("ops");
    expect(defaultDepartmentFor(depts, "ada")).toBeNull();
    expect(defaultDepartmentFor(depts, "nobody")).toBeNull();
  });

  it("nests one level only", () => {
    expect(parentProblem(depts, null, "eng")).toBeNull();
    expect(parentProblem(depts, null, "web")).toMatch(/not under another team/);
    expect(parentProblem(depts, "eng", "ops")).toMatch(/has teams/);
    expect(parentProblem(depts, "ops", "ops")).toMatch(/own team/);
    expect(parentProblem(depts, null, "nope")).toMatch(/isn't in/);
  });
});
