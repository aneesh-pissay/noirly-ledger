/**
 * Reporting periods. A report's range is cut into weeks (Monday to Sunday),
 * months, quarters or years; quarters and years follow the workspace's
 * financial year. The first and last periods are clipped to the range, so
 * totals over the periods are totals over the range. Days are YYYY-MM-DD.
 */
export const GRANULARITIES = ["week", "month", "quarter", "year"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export type Period = { key: string; label: string; from: string; to: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function utc(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number) {
  return iso(new Date(utc(day).getTime() + n * DAY_MS));
}

/** The first day of the period `day` falls in. */
export function periodStart(day: string, granularity: Granularity, fiscalStartMonth = 1): string {
  const d = utc(day);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (granularity === "week") return addDays(day, -((d.getUTCDay() + 6) % 7));
  if (granularity === "month") return iso(new Date(Date.UTC(y, m - 1, 1)));
  const into = (m - fiscalStartMonth + 12) % 12;
  const fyYear = m >= fiscalStartMonth ? y : y - 1;
  if (granularity === "year") return iso(new Date(Date.UTC(fyYear, fiscalStartMonth - 1, 1)));
  return iso(new Date(Date.UTC(fyYear, fiscalStartMonth - 1 + Math.floor(into / 3) * 3, 1)));
}

/** The first day of the period after the one starting on `start`. */
function nextStart(start: string, granularity: Granularity) {
  const d = utc(start);
  if (granularity === "week") return addDays(start, 7);
  const months = granularity === "month" ? 1 : granularity === "quarter" ? 3 : 12;
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

function label(start: string, granularity: Granularity, fiscalStartMonth: number) {
  const d = utc(start);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (granularity === "week") return `${d.getUTCDate()} ${MONTHS[m]}`;
  if (granularity === "month") return `${MONTHS[m]} ${y}`;
  if (granularity === "year") return fiscalStartMonth === 1 ? `${y}` : `FY ${y}–${String((y + 1) % 100).padStart(2, "0")}`;
  const q = Math.floor(((m + 1 - fiscalStartMonth + 12) % 12) / 3) + 1;
  const fy = m + 1 >= fiscalStartMonth ? y : y - 1;
  return fiscalStartMonth === 1 ? `Q${q} ${fy}` : `Q${q} FY ${fy}–${String((fy + 1) % 100).padStart(2, "0")}`;
}

/** The periods covering [from, to], the first and last clipped to it. At most `max` (the latest ones). */
export function periods(from: string, to: string, granularity: Granularity, fiscalStartMonth = 1, max = 400): Period[] {
  if (to < from) return [];
  const out: Period[] = [];
  for (let start = periodStart(from, granularity, fiscalStartMonth); start <= to; start = nextStart(start, granularity)) {
    const end = addDays(nextStart(start, granularity), -1);
    out.push({ key: start, label: label(start, granularity, fiscalStartMonth), from: start < from ? from : start, to: end > to ? to : end });
  }
  return out.slice(-max);
}

/** The index of the period a day falls in, or -1. Periods are sorted and don't overlap. */
export function periodIndex(list: readonly Period[], day: string): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = list[mid]!;
    if (day < p.from) hi = mid - 1;
    else if (day > p.to) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** A granularity that keeps a range to a readable number of periods. */
export function suggestedGranularity(from: string, to: string): Granularity {
  const days = (utc(to).getTime() - utc(from).getTime()) / DAY_MS;
  if (days <= 62) return "week";
  if (days <= 731) return "month";
  if (days <= 365 * 4) return "quarter";
  return "year";
}
