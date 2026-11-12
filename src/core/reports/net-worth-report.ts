import { isLiability, type AccountKind } from "@/src/core/accounts";
import { netWorth } from "@/src/core/net-worth";
import type { Period } from "@/src/core/reports/periods";

/**
 * Net worth and debt over a range, in the base currency. Balances are read
 * at the start of the range and the end of each period; an account counts
 * from the day it was opened (and the day its currency has a rate).
 *
 * Net worth: what you have less what you owe, each period, and which
 * accounts moved it most over the range.
 *
 * Debt: what's owed on each card and loan at the start and the end, what
 * was paid off (money into it) and what was added (spending on it,
 * interest and fees included), and the total owed period by period.
 */

export type AccountBalances = {
  id: string;
  name: string;
  kind: AccountKind;
  /** At the start of the range, then at the end of each period; null where it doesn't count yet. */
  balances: Array<number | null>;
};

export type NetWorthRow = Period & { assetsMinor: number; liabilitiesMinor: number; netMinor: number; changeMinor: number };

export type AccountChange = { id: string; name: string; kind: AccountKind; startMinor: number; endMinor: number; changeMinor: number; effectOnNetMinor: number };

export type NetWorthReport = {
  start: { assetsMinor: number; liabilitiesMinor: number; netMinor: number };
  rows: NetWorthRow[];
  end: { assetsMinor: number; liabilitiesMinor: number; netMinor: number };
  changeMinor: number;
  /** Accounts by how much they moved net worth, biggest first. */
  movers: AccountChange[];
  byKind: Array<{ kind: AccountKind; balanceMinor: number }>;
};

function at(accounts: readonly AccountBalances[], i: number) {
  return netWorth(accounts.flatMap((a) => (a.balances[i] == null ? [] : [{ kind: a.kind, baseBalanceMinor: a.balances[i]! }])));
}

export function netWorthReport(accounts: readonly AccountBalances[], list: readonly Period[]): NetWorthReport {
  const start = at(accounts, 0);
  let previous = start.netMinor;
  const rows = list.map((p, i) => {
    const point = at(accounts, i + 1);
    const row = { ...p, ...point, changeMinor: point.netMinor - previous };
    previous = point.netMinor;
    return row;
  });
  const last = list.length;
  const end = at(accounts, last);
  const movers = accounts
    .map((a) => {
      const startMinor = a.balances[0] ?? 0;
      const endMinor = a.balances[last] ?? 0;
      const changeMinor = endMinor - startMinor;
      // Owing more lowers net worth.
      return { id: a.id, name: a.name, kind: a.kind, startMinor, endMinor, changeMinor, effectOnNetMinor: isLiability(a.kind) ? -changeMinor : changeMinor };
    })
    .filter((m) => m.changeMinor !== 0)
    .sort((x, y) => Math.abs(y.effectOnNetMinor) - Math.abs(x.effectOnNetMinor) || x.name.localeCompare(y.name));
  const kinds = new Map<AccountKind, number>();
  for (const a of accounts) {
    const balance = a.balances[last];
    if (balance != null) kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + balance);
  }
  return {
    start,
    rows,
    end,
    changeMinor: end.netMinor - start.netMinor,
    movers,
    byKind: [...kinds].map(([kind, balanceMinor]) => ({ kind, balanceMinor })).sort((a, b) => Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor)),
  };
}

/** Money through a card or loan in the range, in the base currency. */
export type DebtFlow = { accountId: string; paidMinor: number; chargedMinor: number };

export type DebtRow = { id: string; name: string; kind: AccountKind; startMinor: number; endMinor: number; paidMinor: number; chargedMinor: number; changeMinor: number; paidDownPct: number | null };

export type DebtProgress = {
  debts: DebtRow[];
  totals: { startMinor: number; endMinor: number; paidMinor: number; chargedMinor: number; changeMinor: number };
  /** Owed in total at the end of each period. */
  rows: Array<Period & { owedMinor: number }>;
};

export function debtProgress(accounts: readonly AccountBalances[], flows: readonly DebtFlow[], list: readonly Period[]): DebtProgress {
  const liabilities = accounts.filter((a) => isLiability(a.kind));
  const last = list.length;
  const flowOf = new Map(flows.map((f) => [f.accountId, f]));
  const debts = liabilities
    .map((a) => {
      const startMinor = a.balances[0] ?? 0;
      const endMinor = a.balances[last] ?? 0;
      const flow = flowOf.get(a.id);
      return {
        id: a.id,
        name: a.name,
        kind: a.kind,
        startMinor,
        endMinor,
        paidMinor: flow?.paidMinor ?? 0,
        chargedMinor: flow?.chargedMinor ?? 0,
        changeMinor: endMinor - startMinor,
        // How much of what was owed at the start is gone.
        paidDownPct: startMinor > 0 ? Math.round(((startMinor - endMinor) / startMinor) * 100) : null,
      };
    })
    .filter((d) => d.startMinor || d.endMinor || d.paidMinor || d.chargedMinor)
    .sort((x, y) => y.endMinor - x.endMinor || x.name.localeCompare(y.name));
  const sum = (pick: (d: DebtRow) => number) => debts.reduce((s, d) => s + pick(d), 0);
  return {
    debts,
    totals: { startMinor: sum((d) => d.startMinor), endMinor: sum((d) => d.endMinor), paidMinor: sum((d) => d.paidMinor), chargedMinor: sum((d) => d.chargedMinor), changeMinor: sum((d) => d.changeMinor) },
    rows: list.map((p, i) => ({ ...p, owedMinor: liabilities.reduce((s, a) => s + (a.balances[i + 1] ?? 0), 0) })),
  };
}

/** The month a plan finishes, `months` after `today` (YYYY-MM); null when it never does. */
export function debtFreeMonth(today: string, months: number | null): string | null {
  if (months === null) return null;
  const [y, m] = today.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
}
