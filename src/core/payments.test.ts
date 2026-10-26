import { describe, expect, it } from "vitest";
import { daysOverdue, nextDueDate, paymentStatus } from "@/src/core/payments";

describe("scheduled payments", () => {
  it("is due until its date passes, then overdue, until paid", () => {
    expect(paymentStatus("2026-10-26", "2026-10-26", false)).toBe("due");
    expect(paymentStatus("2026-10-25", "2026-10-26", false)).toBe("overdue");
    expect(paymentStatus("2026-10-25", "2026-10-26", true)).toBe("paid");
    expect(daysOverdue("2026-10-20", "2026-10-26")).toBe(6);
    expect(daysOverdue("2026-10-30", "2026-10-26")).toBe(0);
  });

  it("moves a repeating payment to its next due date, keeping its day", () => {
    expect(nextDueDate("2026-10-05", "monthly")).toBe("2026-11-05");
    expect(nextDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDueDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextDueDate("2026-11-30", "quarterly", 30)).toBe("2027-02-28");
    expect(nextDueDate("2026-10-05", "yearly")).toBe("2027-10-05");
    expect(nextDueDate("2026-10-05", "none")).toBeNull();
  });
});
