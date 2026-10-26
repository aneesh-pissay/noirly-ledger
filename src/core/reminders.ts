/**
 * When to remind someone about money about to go out: a bill coming due, a
 * subscription renewing for another long term, a free trial about to turn
 * into a charge, and a date they meant to cancel by. A run each day sends
 * what's due; each reminder goes once, and one missed day is caught up.
 */

export type ReminderKind = "due" | "renewal" | "trial" | "cancel";

/** A recurring rule's reminder settings; daysBefore null turns due-date reminders off. */
export type ReminderSettings = {
  daysBefore: number | null;
  trialEndsOn: string | null;
  cancelBy: string | null;
};

export const DEFAULT_REMINDER_DAYS = 2;
/** Renewals of a quarter or longer get a week's notice, to decide in time. */
export const RENEWAL_NOTICE_DAYS = 7;
export const TRIAL_NOTICE_DAYS = 3;
export const CANCEL_NOTICE_DAYS = 2;
export const MAX_REMINDER_DAYS = 30;

export type Reminder = {
  kind: ReminderKind;
  /** The day it's about: the charge, the trial's end, or the cancel-by date. */
  on: string;
  /** "ahead" while there's notice to give; "today" on the day itself. */
  stage: "ahead" | "today";
};

function daysUntil(today: string, date: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Whether a rule repeats seldom enough that a charge is a renewal: yearly, or every three months or more. */
export function isRenewal(frequency: string | null, interval = 1) {
  return frequency === "yearly" || (frequency === "monthly" && interval >= 3);
}

/** Whether today falls in the notice window before a date: from `notice` days ahead up to the day before. */
function inNotice(today: string, date: string, notice: number) {
  const left = daysUntil(today, date);
  return left >= 1 && left <= notice;
}

/** What to say about one upcoming charge today, given its rule's settings (none for an EMI or a one-off). */
export function remindersFor(
  charge: { date: string; frequency: string | null; interval?: number },
  settings: ReminderSettings | null,
  today: string,
): Reminder[] {
  const out: Reminder[] = [];
  const daysBefore = settings ? settings.daysBefore : DEFAULT_REMINDER_DAYS;
  if (daysBefore != null) {
    const renewal = isRenewal(charge.frequency, charge.interval);
    const notice = renewal ? Math.max(daysBefore, RENEWAL_NOTICE_DAYS) : daysBefore;
    if (notice === 0 ? charge.date === today : inNotice(today, charge.date, notice)) {
      out.push({ kind: renewal ? "renewal" : "due", on: charge.date, stage: notice === 0 ? "today" : "ahead" });
    }
  }
  return out;
}

/** Trial and cancel-by reminders for a rule today: notice ahead, then once more on the day. */
export function datedReminders(settings: ReminderSettings | null, today: string): Reminder[] {
  const out: Reminder[] = [];
  const add = (kind: "trial" | "cancel", date: string | null, notice: number) => {
    if (!date) return;
    if (date === today) out.push({ kind, on: date, stage: "today" });
    else if (inNotice(today, date, notice)) out.push({ kind, on: date, stage: "ahead" });
  };
  add("trial", settings?.trialEndsOn ?? null, TRIAL_NOTICE_DAYS);
  add("cancel", settings?.cancelBy ?? null, CANCEL_NOTICE_DAYS);
  return out;
}

/** The key that makes each reminder go once. */
export function reminderKey(itemId: string, reminder: Reminder) {
  return `${reminder.kind}:${itemId}:${reminder.on}:${reminder.stage}`;
}

/** The words of a reminder; `name` and `amount` are already formatted. */
export function reminderText(reminder: Reminder, name: string, amount: string, today: string) {
  const left = daysUntil(today, reminder.on);
  const when = left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days, on ${reminder.on}`;
  switch (reminder.kind) {
    case "due":
      return { title: `${name} is due ${left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}`, body: `${amount} is due ${when}.` };
    case "renewal":
      return { title: `${name} renews ${left === 1 ? "tomorrow" : `in ${left} days`}`, body: `${amount} will be charged ${when}. Cancel before then if you don't want another term.` };
    case "trial":
      return {
        title: left === 0 ? `${name}'s free trial ends today` : `${name}'s free trial ends ${left === 1 ? "tomorrow" : `in ${left} days`}`,
        body: `After the trial it costs ${amount}. Cancel before it ends if you don't want to pay.`,
      };
    case "cancel":
      return { title: left === 0 ? `Cancel ${name} today` : `Cancel ${name} by ${reminder.on}`, body: `You meant to cancel ${name} (${amount}) by ${reminder.on}.` };
  }
}
