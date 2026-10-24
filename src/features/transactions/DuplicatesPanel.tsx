"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import type { Transaction } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  accountName: (id: string | null) => string;
};

const WHY = { upi: "Same UPI reference", "same-day": "Same amount, same day", nearby: "Same amount and description, a few days apart" } as const;

/** Recent transactions that look like one payment recorded twice; delete the extra one, or say they're separate. */
export function DuplicatesPanel({ workspaceId, accountName }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const [open, setOpen] = useState(false);
  const duplicates = useQuery({ queryKey: ["duplicates", workspaceId], queryFn: () => api.listDuplicates(workspaceId) });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["duplicates", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) }),
    ]);
  const remove = useMutation({ mutationFn: (id: string) => api.deleteTransaction(id), onSuccess: refresh });
  const keepBoth = useMutation({ mutationFn: ({ a, b }: { a: string; b: string }) => api.markNotDuplicate(a, b), onSuccess: refresh });
  const pairs = duplicates.data?.pairs ?? [];
  if (!pairs.length) return null;

  const line = (t: Transaction) => (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-xs tabular-nums text-[var(--muted-foreground)]">{t.date}</span>
      <span className="truncate">{[t.merchant, t.note].filter(Boolean).join(" · ") || "No note"}</span>
      <span className="text-xs text-[var(--muted-foreground)]">{accountName(t.accountId)}</span>
      <span className="ml-auto font-mono tabular-nums">{money(t.type === "expense" ? -t.amountMinor : t.amountMinor, t.currency)}</span>
    </span>
  );

  return (
    <section aria-label="Possible duplicates" className="mt-4 rounded-xl border border-[var(--hairline)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">{pairs.length} possible duplicate{pairs.length === 1 ? "" : "s"}</span>
          <span className="text-[var(--muted-foreground)]"> · the same payment may be recorded twice</span>
        </p>
        <button type="button" className="text-sm underline" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Review"}
        </button>
      </div>
      {remove.error || keepBoth.error ? <p role="alert" className="mt-2 text-sm text-[var(--balance-negative)]">{(remove.error ?? keepBoth.error)?.message}</p> : null}
      {open ? (
        <ul className="mt-3 divide-y divide-[var(--hairline)]">
          {pairs.map(({ first, second, reason }) => (
            <li key={`${first.id}-${second.id}`} data-duplicate-pair={`${first.id}-${second.id}`} className="space-y-1 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">{WHY[reason]}</p>
              {line(first)}
              {line(second)}
              <div className="flex gap-3 pt-1 text-xs">
                <button type="button" className="underline" disabled={remove.isPending} onClick={() => remove.mutate(second.id)}>
                  Delete the second
                </button>
                <button type="button" className="underline" disabled={keepBoth.isPending} onClick={() => keepBoth.mutate({ a: first.id, b: second.id })}>
                  Keep both
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
