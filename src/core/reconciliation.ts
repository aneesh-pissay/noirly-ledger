/**
 * Reconciliation reports: for each account, when it was last checked against
 * a statement, whether what was reconciled still adds up to that statement
 * (a reconciled transaction deleted since, or the opening balance changed,
 * shows as drift), what was added afterwards dated inside the reconciled
 * period, and pending transactions that have waited too long.
 */

/** An account not reconciled for this long is due. */
export const RECONCILE_DUE_DAYS = 45;
/** A pending transaction older than this is worth chasing. */
export const STALE_PENDING_DAYS = 14;

export type ReconStatus = "never" | "ok" | "due" | "drift";

export const RECON_STATUS_LABEL: Record<ReconStatus, string> = {
  never: "Never reconciled",
  ok: "Up to date",
  due: "Due",
  drift: "Doesn't add up",
};

export type AccountReconInput = {
  reconciledThrough: string | null;
  reconciledBalanceMinor: number | null;
  /** What the reconciled transactions (and opening balance) come to today. */
  reconciledNowMinor: number | null;
  /** Live, cleared but not reconciled, dated on or before reconciledThrough. */
  lateCount: number;
};

const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Where an account stands, as of `today` (YYYY-MM-DD). Drift wins over due: it's the one that needs looking at. */
export function reconStatus(input: AccountReconInput, today: string): { status: ReconStatus; daysSince: number | null; driftMinor: number | null } {
  if (!input.reconciledThrough || input.reconciledBalanceMinor == null) return { status: "never", daysSince: null, driftMinor: null };
  const daysSince = daysBetween(input.reconciledThrough, today);
  const driftMinor = input.reconciledNowMinor == null ? null : input.reconciledNowMinor - input.reconciledBalanceMinor;
  if ((driftMinor ?? 0) !== 0 || input.lateCount > 0) return { status: "drift", daysSince, driftMinor };
  return { status: daysSince > RECONCILE_DUE_DAYS ? "due" : "ok", daysSince, driftMinor };
}

/** The day before which a pending transaction counts as stale. */
export function stalePendingBefore(today: string) {
  return new Date(Date.parse(`${today}T00:00:00Z`) - STALE_PENDING_DAYS * DAY_MS).toISOString().slice(0, 10);
}

export type AccountReconView = {
  accountId: string;
  name: string;
  kind: string;
  currency: string;
  archived: boolean;
  status: ReconStatus;
  reconciledThrough: string | null;
  reconciledBalanceMinor: number | null;
  reconciledNowMinor: number | null;
  driftMinor: number | null;
  daysSince: number | null;
  lateCount: number;
  /** Cleared, not yet reconciled, dated up to today. */
  unreconciledCount: number;
  pendingCount: number;
  stalePendingCount: number;
  oldestPending: string | null;
};

export type ReconciliationView = {
  id: string;
  accountId: string;
  accountName: string;
  currency: string;
  through: string;
  statementMinor: number;
  transactionCount: number;
  by: string | null;
  at: string;
};

export type ReconReport = { asOf: string; accounts: AccountReconView[]; history: ReconciliationView[] };

function cell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The report as CSV: one row per account, then the reconciliations made. Amounts in minor units' major form. */
export function reconReportCsv(report: ReconReport, major: (minor: number) => string) {
  const money = (minor: number | null) => (minor == null ? null : major(minor));
  const rows: Array<Array<string | number | null>> = [
    ["Account", "Currency", "Status", "Reconciled through", "Statement balance", "Reconciled now", "Difference", "Added late", "Not reconciled", "Pending", `Pending over ${STALE_PENDING_DAYS} days`, "Oldest pending"],
    ...report.accounts.map((a) => [a.name, a.currency, RECON_STATUS_LABEL[a.status], a.reconciledThrough, money(a.reconciledBalanceMinor), money(a.reconciledNowMinor), money(a.driftMinor), a.lateCount, a.unreconciledCount, a.pendingCount, a.stalePendingCount, a.oldestPending]),
    [],
    ["Reconciled on", "Account", "Currency", "Through", "Statement balance", "Transactions", "By"],
    ...report.history.map((h) => [h.at.slice(0, 10), h.accountName, h.currency, h.through, major(h.statementMinor), h.transactionCount, h.by]),
  ];
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
