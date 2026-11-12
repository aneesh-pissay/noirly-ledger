/**
 * How amounts are grouped for reading, and when a financial year starts.
 *
 * Indian numbering groups the last three digits, then pairs: 12,34,56,789.00
 * (12 crore 34 lakh ...). International groups in threes: 123,456,789.00.
 * "auto" uses Indian numbering for rupee amounts and international for the rest.
 */
export const NUMBER_FORMATS = ["auto", "indian", "international"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const NUMBER_FORMAT_LABEL: Record<NumberFormat, string> = {
  auto: "Lakh and crore for rupees, thousands and millions otherwise",
  indian: "Lakh and crore (12,34,567.00)",
  international: "Thousands and millions (1,234,567.00)",
};

function groupDigits(digits: string, indian: boolean) {
  if (digits.length <= 3) return digits;
  const last = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const size = indian ? 2 : 3;
  const groups: string[] = [];
  for (let end = rest.length; end > 0; end -= size) groups.unshift(rest.slice(Math.max(0, end - size), end));
  return `${groups.join(",")},${last}`;
}

export function usesIndianGrouping(format: NumberFormat, currency: string) {
  return format === "indian" || (format === "auto" && currency.toUpperCase() === "INR");
}

/** A minor-unit amount for reading, grouped: 123456789 INR → "12,34,567.89". Not for inputs; see formatMinorToMajor. */
export function formatGrouped(minor: number, currency: string, format: NumberFormat = "auto", fractionDigits = 2) {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const scale = 10 ** fractionDigits;
  const whole = groupDigits(String(Math.floor(abs / scale)), usesIndianGrouping(format, currency));
  if (!fractionDigits) return `${sign}${whole}`;
  return `${sign}${whole}.${String(abs % scale).padStart(fractionDigits, "0")}`;
}

/** An amount with its currency code, as shown across the app: "12,34,567.89 INR". */
export function formatMoney(minor: number, currency: string, format: NumberFormat = "auto") {
  return `${formatGrouped(minor, currency, format)} ${currency}`;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Where a workspace's financial year starts (1 = January) when it hasn't said: April for rupee workspaces, as in India. */
export function defaultFiscalStart(baseCurrency: string) {
  return baseCurrency.toUpperCase() === "INR" ? 4 : 1;
}

/**
 * The financial year a day falls in, for a year starting on the 1st of
 * `startMonth`: its first and last days (YYYY-MM-DD) and its name, like
 * "FY 2026–27" for an April start or "FY 2026" for a January one.
 * `offset` moves to earlier (-1) or later years.
 */
export function fiscalYear(day: string, startMonth: number, offset = 0) {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const startYear = (month >= startMonth ? year : year - 1) + offset;
  const from = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const to = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));
  const label = startMonth === 1 ? `FY ${startYear}` : `FY ${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), label };
}
