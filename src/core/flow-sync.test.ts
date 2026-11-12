import { describe, expect, it } from "vitest";
import type { BillItem } from "@/src/core/bills";
import { billKey, billTask, DEFAULT_FLOW_SETTINGS, flowSettingsProblem, markerTask, planSync, type DesiredTask, type TrackedTask } from "./flow-sync";

const item = (over: Partial<BillItem>): BillItem => ({
  id: "x",
  date: "2026-11-05",
  merchant: "Netflix",
  note: null,
  amountMinor: 64_900,
  currency: "INR",
  categoryId: null,
  accountId: null,
  source: "recurring",
  status: "upcoming",
  transactionId: null,
  ruleId: "r1",
  frequency: "monthly",
  ...over,
});
const money = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`;
const want = (key: string, dueDate: string, done = false): DesiredTask => ({ key, title: key, description: "", dueDate, done });
const track = (key: string, dueDate: string, state: TrackedTask["state"] = "open"): TrackedTask => ({ key, flowTaskId: `t-${key}`, dueDate, state });

describe("Flow sync", () => {
  it("keys a recurring charge by rule and day, so recording it keeps the same task", () => {
    expect(billKey(item({ id: "r1:2026-11-05" }))).toBe("rule:r1:2026-11-05");
    expect(billKey(item({ id: "txn9", transactionId: "txn9", status: "paid" }))).toBe("rule:r1:2026-11-05");
    expect(billKey(item({ source: "payment", id: "p1", ruleId: null }))).toBe("payment:p1");
  });

  it("words tasks", () => {
    expect(billTask(item({}), money, "Home")).toMatchObject({ title: "Pay Netflix: 649.00 INR", dueDate: "2026-11-05", done: false });
    expect(billTask(item({ status: "paid" }), money, "Home").done).toBe(true);
    expect(markerTask({ date: "2026-11-09", kind: "trial", ruleId: "r2", name: "Spotify" }, "Home")).toMatchObject({ key: "trial:r2:2026-11-09", title: "Free trial of Spotify ends" });
    expect(markerTask({ date: "2026-11-09", kind: "cancel", ruleId: "r2", name: null }, "Home").title).toBe("Cancel a subscription");
  });

  it("checks settings", () => {
    expect(flowSettingsProblem(DEFAULT_FLOW_SETTINGS)).toBeNull();
    expect(flowSettingsProblem({ ...DEFAULT_FLOW_SETTINGS, bills: false, reminders: false })).toMatch(/bills, reminders/);
    expect(flowSettingsProblem({ ...DEFAULT_FLOW_SETTINGS, daysAhead: 40 })).toMatch(/1 to 31/);
  });

  it("makes, completes, moves and cancels", () => {
    const plan = planSync(
      [want("new", "2026-11-03"), want("late", "2026-11-20"), want("paidAlready", "2026-11-02", true), want("paid", "2026-11-01", true), want("moved", "2026-11-06"), want("same", "2026-11-04")],
      [track("paid", "2026-11-01"), track("moved", "2026-11-04"), track("same", "2026-11-04"), track("gone", "2026-11-02"), track("goneLongAgo", "2026-09-30"), track("closed", "2026-11-02", "done")],
      { scannedFrom: "2026-10-01", today: "2026-11-01", through: "2026-11-08" },
    );
    expect(plan.create.map((d) => d.key)).toEqual(["new"]);
    expect(plan.complete.map((t) => t.key)).toEqual(["paid"]);
    expect(plan.move).toEqual([{ task: track("moved", "2026-11-04"), dueDate: "2026-11-06" }]);
    expect(plan.cancel.map((t) => t.key)).toEqual(["gone"]);
  });

  it("doesn't make a task for a trial that already ended", () => {
    const past = { ...want("trial:r:2026-10-20", "2026-10-20"), onlyAhead: true };
    const ahead = { ...want("trial:r:2026-11-03", "2026-11-03"), onlyAhead: true };
    const plan = planSync([past, ahead, want("overdue", "2026-10-20")], [], { scannedFrom: "2026-10-01", today: "2026-11-01", through: "2026-11-08" });
    expect(plan.create.map((d) => d.key)).toEqual(["overdue", "trial:r:2026-11-03"]);
  });
});
