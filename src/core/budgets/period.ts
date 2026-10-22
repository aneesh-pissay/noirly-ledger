import type { BudgetPeriod } from "@/src/core/models/enums";

export type DateRange = {
  from: Date;
  to: Date;
};

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

export function periodWindow(
  period: BudgetPeriod,
  at = new Date(),
  custom?: { start: string | null; end: string | null },
): DateRange {
  if (period === "custom") {
    const from = custom?.start ? startOfUtcDay(new Date(custom.start)) : startOfUtcDay(at);
    const to = custom?.end ? endOfUtcDay(new Date(custom.end)) : endOfUtcDay(at);
    return { from, to };
  }

  if (period === "weekly") {
    const day = at.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + mondayOffset),
    );
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: startOfUtcDay(monday), to: endOfUtcDay(sunday) };
  }

  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { from, to };
}

export function dashboardRange(
  preset: "7d" | "30d" | "90d" | "mtd" | "fy",
  at = new Date(),
  fiscalYearStartMonth = 1,
): DateRange {
  const to = endOfUtcDay(at);
  if (preset === "fy") {
    // From the first day of the financial year that today falls in.
    const startYear = at.getUTCMonth() + 1 >= fiscalYearStartMonth ? at.getUTCFullYear() : at.getUTCFullYear() - 1;
    return { from: new Date(Date.UTC(startYear, fiscalYearStartMonth - 1, 1)), to };
  }
  if (preset === "mtd") {
    return {
      from: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)),
      to,
    };
  }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const from = startOfUtcDay(at);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from, to };
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
