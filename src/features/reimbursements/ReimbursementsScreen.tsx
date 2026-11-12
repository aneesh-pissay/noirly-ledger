"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { MoneyText } from "@/src/components/MoneyText";
import { owedByClaimant, PAYOUT_METHOD_LABEL, PAYOUT_METHODS, type PayoutMethod, type ReimbursementStatus } from "@/src/core/reimbursements";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-xs";
const STATUS_LABEL: Record<ReimbursementStatus, string> = { pending: "Waiting for approval", owed: "Owed", paid: "Paid back", void: "Not owed" };
const today = () => new Date().toISOString().slice(0, 10);

function reimbursementsKey(workspaceId: string) {
  return ["reimbursements", workspaceId] as const;
}

/** One person's owed total, and the form to record paying it back. */
function PayRow({ workspaceId, row, currency }: { workspaceId: string; row: { claimantId: string; claimantName: string; totalMinor: number; ids: string[] }; currency: string }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PayoutMethod>("bank");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const pay = useMutation({
    mutationFn: () => api.createPayout(workspaceId, { reimbursementIds: row.ids, method, reference: reference.trim() || null, paidOn }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reimbursementsKey(workspaceId) }),
  });
  return (
    <li data-owed={row.claimantName} className="space-y-2 border-t border-[var(--hairline)] pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          {row.claimantName}
          <span className="ml-2 text-xs text-[var(--muted-foreground)]">{row.ids.length} expense{row.ids.length === 1 ? "" : "s"}</span>
        </p>
        <MoneyText amountMinor={row.totalMinor} currency={currency} />
      </div>
      <form
        aria-label={`Pay back ${row.claimantName}`}
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          pay.mutate();
        }}
      >
        <select aria-label="How" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)} className={field}>
          {PAYOUT_METHODS.map((m) => (
            <option key={m} value={m}>{PAYOUT_METHOD_LABEL[m]}</option>
          ))}
        </select>
        <input aria-label="Reference" maxLength={120} placeholder="Reference (UTR, note…)" value={reference} onChange={(e) => setReference(e.target.value)} className={`${field} min-w-0 flex-1`} />
        <input aria-label="Paid on" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={field} />
        <button type="submit" disabled={pay.isPending} className="h-9 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-ink)]">
          Record payout
        </button>
      </form>
      {pay.error ? <p role="alert" className="text-xs text-[var(--balance-negative)]">{pay.error.message}</p> : null}
    </li>
  );
}

/**
 * Expenses people paid themselves, and paying them back. Everyone sees
 * their own; those who can pay back see who is owed what, record payouts,
 * and can undo one recorded by mistake.
 */
export function ReimbursementsScreen({ workspaceId, currentUserId, baseCurrency }: { workspaceId: string; currentUserId: string; baseCurrency: string }) {
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: reimbursementsKey(workspaceId), queryFn: () => api.listReimbursements(workspaceId) });
  const undo = useMutation({ mutationFn: (id: string) => api.undoPayout(workspaceId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: reimbursementsKey(workspaceId) }) });
  const [filter, setFilter] = useState<ReimbursementStatus | "all">("all");

  const items = data.data?.reimbursements ?? [];
  const payouts = data.data?.payouts ?? [];
  const canPay = data.data?.canPay ?? false;
  const mine = items.filter((r) => r.claimantId === currentUserId);
  const owedToMe = mine.filter((r) => r.status === "owed").reduce((sum, r) => sum + r.amountMinor, 0);
  const owed = owedByClaimant(items);
  const shown = items.filter((r) => filter === "all" || r.status === filter);

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Reimbursements</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Expenses paid out of pocket. Tick &ldquo;pay me back&rdquo; when submitting one; once approved it&apos;s owed until a payout is recorded.
      </p>

      <section aria-label="Owed to you" className="surface grain mt-6 flex items-baseline justify-between rounded-[var(--r-lg)] p-4">
        <p className="text-sm">Owed to you</p>
        <MoneyText amountMinor={owedToMe} currency={baseCurrency} className="text-lg" />
      </section>

      {canPay ? (
        <section aria-label="To pay back" className="surface grain mt-6 space-y-3 rounded-[var(--r-lg)] p-4">
          <h2 className="text-sm font-medium">To pay back</h2>
          {owed.length ? (
            <ul className="space-y-3">
              {owed.map((row) => (
                <PayRow key={row.claimantId} workspaceId={workspaceId} row={row} currency={baseCurrency} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">Nobody is owed anything.</p>
          )}
        </section>
      ) : null}

      <section aria-label="Reimbursements" className="mt-6">
        <div className="flex flex-wrap gap-2">
          {(["all", "owed", "pending", "paid", "void"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-xs ${filter === value ? "bg-[var(--surface)] text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              {value === "all" ? "All" : STATUS_LABEL[value]}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          {shown.map((r) => (
            <li key={r.id} data-reimbursement={r.note ?? "Expense"} className="surface grain flex flex-wrap items-start justify-between gap-3 rounded-[var(--r-lg)] p-3">
              <div>
                <p className="text-sm">{r.note || "Expense"}</p>
                <p className="mt-1 font-mono text-[11px] text-[var(--muted-foreground)]">
                  {canPay ? `${r.claimantName} · ` : ""}{r.date} · {STATUS_LABEL[r.status]}{r.paidOn ? ` on ${r.paidOn}` : ""}
                </p>
              </div>
              <div className="text-right">
                <MoneyText amountMinor={r.amountMinor} currency={r.currency} />
                {r.spentCurrency !== r.currency ? (
                  <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                    spent <MoneyText amountMinor={r.spentMinor} currency={r.spentCurrency} />
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {!shown.length && !data.isLoading ? <p className="mt-3 text-sm text-[var(--muted-foreground)]">Nothing here.</p> : null}
      </section>

      {payouts.length ? (
        <section aria-label="Payouts" className="surface grain mt-6 space-y-2 rounded-[var(--r-lg)] p-4">
          <h2 className="text-sm font-medium">Payouts</h2>
          <ul className="space-y-2">
            {payouts.map((p) => (
              <li key={p.id} data-payout={p.claimantName} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className={p.undoneAt ? "line-through opacity-60" : ""}>
                  {p.paidByName} paid {p.claimantName}
                  <span className="ml-2 font-mono text-[11px] text-[var(--muted-foreground)]">
                    {p.paidOn} · {PAYOUT_METHOD_LABEL[p.method]}{p.reference ? ` · ${p.reference}` : ""} · {p.count} expense{p.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex items-baseline gap-3">
                  <MoneyText amountMinor={p.amountMinor} currency={p.currency} />
                  {canPay && !p.undoneAt ? (
                    <button type="button" className="text-xs text-[var(--muted-foreground)] underline" disabled={undo.isPending} onClick={() => { if (window.confirm(`Undo paying ${p.claimantName}? Those expenses will be owed again.`)) undo.mutate(p.id); }}>
                      Undo
                    </button>
                  ) : null}
                  {p.undoneAt ? <span className="text-xs text-[var(--muted-foreground)]">undone</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {undo.error ? <p role="alert" className="text-xs text-[var(--balance-negative)]">{undo.error.message}</p> : null}
        </section>
      ) : null}
    </PageContainer>
  );
}
