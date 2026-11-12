"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { RECON_STATUS_LABEL, RECONCILE_DUE_DAYS, STALE_PENDING_DAYS, type AccountReconView, type ReconStatus } from "@/src/core/reconciliation";

const TONE: Record<ReconStatus, string> = {
  drift: "text-[var(--balance-negative)]",
  due: "text-[var(--accent)]",
  never: "text-[var(--muted-foreground)]",
  ok: "text-[var(--balance-positive)]",
};

/** What's wrong with an account, in a line. */
function findings(a: AccountReconView, amount: (minor: number, currency: string) => string) {
  const out: string[] = [];
  if (a.driftMinor) {
    out.push(`Reconciled transactions now come to ${amount(a.reconciledNowMinor!, a.currency)}, ${amount(Math.abs(a.driftMinor), a.currency)} ${a.driftMinor > 0 ? "more" : "less"} than the statement: one was deleted, or the opening balance changed.`);
  }
  if (a.lateCount) out.push(`${a.lateCount} added since, dated on or before ${a.reconciledThrough}.`);
  if (a.status === "due") out.push(`Last reconciled ${a.daysSince} days ago.`);
  if (a.stalePendingCount) out.push(`${a.stalePendingCount} pending for over ${STALE_PENDING_DAYS} days (oldest ${a.oldestPending}).`);
  return out;
}

/** /accounts/reconciliation — which accounts agree with their statements, and what's changed since they were checked. */
export function ReconciliationScreen({ workspaceId, accountsPath }: { workspaceId: string; accountsPath: string }) {
  const { amount } = useMoneyFormat();
  const report = useQuery({ queryKey: ["reconciliation", workspaceId], queryFn: () => api.reconciliationReport(workspaceId) });
  const data = report.data;

  return (
    <PageContainer size="md">
      <Link href={accountsPath} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Accounts</Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Reconciliation report</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Whether each account still agrees with the last statement it was reconciled to. Accounts are due after {RECONCILE_DUE_DAYS} days.
      </p>
      <a href={`/api/workspaces/${workspaceId}/reconciliation?format=csv`} className="mt-3 inline-flex h-9 items-center rounded-md border border-[var(--hairline)] px-3 text-sm">
        Download CSV
      </a>
      {report.error ? <p role="alert" className="mt-6 text-sm text-[var(--balance-negative)]">{report.error.message}</p> : null}

      {data ? (
        <>
          <section aria-label="Accounts" className="mt-6 surface grain overflow-hidden rounded-[var(--r-lg)] text-sm">
            {data.accounts.length === 0 ? <p className="p-4 text-[var(--muted-foreground)]">No accounts yet.</p> : null}
            <ul className="divide-y divide-[var(--hairline)]">
              {data.accounts.map((a) => (
                <li key={a.accountId} data-account={a.name} data-status={a.status} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{a.name}{a.archived ? <span className="ml-2 text-xs text-[var(--muted-foreground)]">archived</span> : null}</span>
                    <span className={`font-mono text-[11px] uppercase ${TONE[a.status]}`}>{RECON_STATUS_LABEL[a.status]}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {a.reconciledThrough ? `Through ${a.reconciledThrough} at ${amount(a.reconciledBalanceMinor!, a.currency)} ${a.currency}` : "Not reconciled yet"}
                    {` · ${a.unreconciledCount} cleared, not reconciled · ${a.pendingCount} pending`}
                  </p>
                  {findings(a, amount).map((line) => <p key={line} className="mt-1 text-xs">{line}</p>)}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Reconciliations" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
            <h2 className="font-medium">Reconciliations</h2>
            {data.history.length === 0 ? <p className="mt-2 text-xs text-[var(--muted-foreground)]">None yet. Reconcile an account from the Accounts page.</p> : null}
            <ul className="mt-2 divide-y divide-[var(--hairline)]">
              {data.history.map((h) => (
                <li key={h.id} data-reconciliation={h.accountName} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{h.accountName} <span className="text-xs text-[var(--muted-foreground)]">through {h.through}</span></span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {amount(h.statementMinor, h.currency)} {h.currency} · {h.transactionCount} transaction{h.transactionCount === 1 ? "" : "s"} · {h.by ?? "someone"} · {new Date(h.at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </PageContainer>
  );
}
