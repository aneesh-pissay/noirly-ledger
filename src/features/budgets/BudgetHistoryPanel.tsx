"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { REVISION_LABEL } from "@/src/core/budgets/revisions";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { Select } from "@/src/components/Select";
import type { Budget } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  baseCurrency: string;
  budgets: Budget[];
  categoryName: (id: string) => string;
};

/** Move part of one budget's limit to another, and look back on every change (restoring an earlier limit if needed). */
export function BudgetHistoryPanel({ workspaceId, baseCurrency, budgets, categoryName }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const revisions = useQuery({ queryKey: qk.budgetRevisions(workspaceId), queryFn: () => api.listBudgetRevisions(workspaceId) });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
    ]);

  const move = useMutation({
    mutationFn: () => api.moveBudgetMoney(workspaceId, { fromBudgetId: from, toBudgetId: to, amountMajor: amount.trim(), note: note.trim() || null }),
    onMutate: () => setError(null),
    onSuccess: () => { setAmount(""); setNote(""); void refresh(); },
    onError: (err: Error) => setError(err.message),
  });
  const restore = useMutation({
    mutationFn: (revisionId: string) => api.restoreBudgetRevision(revisionId),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const label = (budget: Budget) => `${categoryName(budget.categoryId)} (${budget.period}, ${money(budget.limitAmountMinor, budget.currency)})`;
  // Restoring only makes sense to a limit the budget doesn't have now.
  const currentLimit = new Map(budgets.map((b) => [b.id, b.limitAmountMinor]));
  const list = revisions.data?.revisions ?? [];

  return (
    <section aria-label="Budget changes" className="mt-8 space-y-4">
      {budgets.length > 1 ? (
        <form
          aria-label="Move between budgets"
          className="grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-4 sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (from && to && amount.trim()) move.mutate(); }}
        >
          <h2 className="text-sm font-medium sm:col-span-4">Move money between budgets</h2>
          <div className="sm:col-span-2">
            <Label htmlFor="bm-from">From</Label>
            <Select id="bm-from" value={from} onChange={(e) => setFrom(e.target.value)} required>
              <option value="">Choose a budget</option>
              {budgets.map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="bm-to">To</Label>
            <Select id="bm-to" value={to} onChange={(e) => setTo(e.target.value)} required>
              <option value="">Choose a budget</option>
              {budgets.filter((b) => b.id !== from).map((b) => <option key={b.id} value={b.id}>{label(b)}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="bm-amount">Amount ({baseCurrency})</Label>
            <Input id="bm-amount" inputMode="decimal" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="bm-note">Why (optional)</Label>
            <Input id="bm-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" disabled={move.isPending}>Move</Button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error}</p> : null}

      {list.length ? (
        <div>
          <h2 className="text-sm font-medium">History</h2>
          <ul aria-label="Budget history" className="mt-2 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {list.map((revision) => (
              <li key={revision.id} data-revision={revision.reason} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="font-mono text-xs text-[var(--muted-foreground)]">{revision.createdAt.slice(0, 10)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {categoryName(revision.categoryId)} · {REVISION_LABEL[revision.reason]}
                  {revision.note ? <span className="text-[var(--muted-foreground)]"> · {revision.note}</span> : null}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {revision.previousLimitMinor == null ? "—" : money(revision.previousLimitMinor, baseCurrency)} → {revision.limitMinor == null ? "deleted" : money(revision.limitMinor, baseCurrency)}
                </span>
                {revision.limitMinor != null && currentLimit.has(revision.budgetId) && currentLimit.get(revision.budgetId) !== revision.limitMinor ? (
                  <button type="button" className="text-xs underline" disabled={restore.isPending} onClick={() => restore.mutate(revision.id)}>
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
