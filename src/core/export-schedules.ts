/**
 * Scheduled exports: a report emailed to chosen members every week (on a
 * weekday) or every month (on a day, 1–28), each time covering the full
 * week or month just finished. Days are YYYY-MM-DD.
 */
export const EXPORT_FORMATS = ["csv", "pdf", "xlsx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FREQUENCIES = ["weekly", "monthly"] as const;
export type ExportFrequency = (typeof EXPORT_FREQUENCIES)[number];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type ExportSchedule = {
  frequency: ExportFrequency;
  /** Weekly: 1 (Monday) to 7 (Sunday). Monthly: 1 to 28. */
  runDay: number;
};

/** A scheduled report as set up. */
export type ScheduledExportBody = {
  name: string;
  format: ExportFormat;
  template: "summary" | "pool" | "approvals";
  budgetPoolId: string | null;
  frequency: ExportFrequency;
  runDay: number;
  /** Members it's emailed to. */
  recipientIds: string[];
};

/** A scheduled report as listed, with how its last run went. */
export type ScheduledExportView = ScheduledExportBody & {
  id: string;
  schedule: string;
  recipientNames: string[];
  nextRunOn: string;
  paused: boolean;
  lastRunAt: string | null;
  lastRange: { from: string; to: string } | null;
  lastSentTo: number;
  lastError: string | null;
};

const DAY_MS = 86_400_000;

function utc(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(day: string, n: number) {
  return iso(new Date(utc(day).getTime() + n * DAY_MS));
}

/** Monday 1 … Sunday 7. */
function weekday(day: string) {
  return ((utc(day).getUTCDay() + 6) % 7) + 1;
}

/** The first run on or after `day`. */
export function nextRunOn(schedule: ExportSchedule, day: string): string {
  if (schedule.frequency === "weekly") return addDays(day, (schedule.runDay - weekday(day) + 7) % 7);
  const d = utc(day);
  const thisMonth = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), schedule.runDay)));
  return thisMonth >= day ? thisMonth : iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, schedule.runDay)));
}

/** The run after the one on `runOn`. */
export function runAfter(schedule: ExportSchedule, runOn: string): string {
  return nextRunOn(schedule, addDays(runOn, 1));
}

/** What a run on `runOn` covers: the full week (Monday–Sunday) or month before it. */
export function coveredRange(frequency: ExportFrequency, runOn: string): { from: string; to: string } {
  if (frequency === "weekly") {
    const thisMonday = addDays(runOn, -(weekday(runOn) - 1));
    return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
  }
  const d = utc(runOn);
  return {
    from: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))),
    to: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))),
  };
}

/** A schedule in words: "Every Monday", "On the 3rd of every month". */
export function describeSchedule(schedule: ExportSchedule): string {
  if (schedule.frequency === "weekly") return `Every ${WEEKDAYS[schedule.runDay - 1] ?? "week"}, for the week before`;
  const n = schedule.runDay;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `On the ${n}${suffix} of every month, for the month before`;
}

export function scheduleProblem(schedule: ExportSchedule): string | null {
  if (!Number.isInteger(schedule.runDay)) return "Pick a day";
  if (schedule.frequency === "weekly" && (schedule.runDay < 1 || schedule.runDay > 7)) return "Pick a day of the week";
  if (schedule.frequency === "monthly" && (schedule.runDay < 1 || schedule.runDay > 28)) return "Pick a day from 1 to 28";
  return null;
}
