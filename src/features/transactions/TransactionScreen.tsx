"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { MoneyText } from "@/src/components/MoneyText";
import { Button, PageContainer } from "@noirly-dev/ui";
import { useUIStore } from "@/src/stores/ui-store";

type Props = {
  workspaceId: string;
  baseCurrency: string;
  recurringOnly?: boolean;
};

export function TransactionScreen({
  workspaceId,
  baseCurrency,
  recurringOnly = false,
}: Props) {
  const setOpen = useUIStore((s) => s.setTransactionComposerOpen);
  const queryClient = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);
  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
  });
  // /transactions?account=… lists one account's transactions (linked from Accounts).
  const accountFilter = useSearchParams().get("account") ?? undefined;
  const accounts = useQuery({
    queryKey: qk.accounts(workspaceId),
    queryFn: () => api.listAccounts(workspaceId),
  });
  const txns = useQuery({
    queryKey: qk.transactions(workspaceId, { recurring: recurringOnly, accountId: accountFilter }),
    queryFn: () =>
      api.listTransactions(workspaceId, { recurring: recurringOnly, accountId: accountFilter, limit: 200 }),
  });
  const accountName = (id: string | null) =>
    id ? accounts.data?.accounts.find((a) => a.id === id)?.name ?? "Account" : "—";
  const filtered = accountFilter ? accounts.data?.accounts.find((a) => a.id === accountFilter) : undefined;

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) }),
      ]),
  });

  const items = txns.data?.items ?? [];
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });

  const categoryName = (id: string | null) =>
    categories.data?.categories.find((c) => c.id === id)?.name ?? "Uncategorized";

  return (
    <PageContainer size="lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {recurringOnly ? "Recurring" : "Transactions"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Amounts in original currency; base {baseCurrency} is stored on save.
          </p>
          {accountFilter ? (
            <p className="mt-1 text-sm">
              Showing {filtered?.name ?? "one account"} ·{" "}
              <Link href={recurringOnly ? "/recurring" : "/transactions"} className="underline">Show all</Link>
            </p>
          ) : null}
        </div>
        <Button onClick={() => setOpen(true)}>Add</Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--hairline)]">
        <div className="grid grid-cols-[7rem_1fr_1fr_1fr_6rem_8rem_4rem] border-b border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
          <span>Date</span>
          <span>Category</span>
          <span>Account</span>
          <span>Note</span>
          <span>Type</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <div ref={parentRef} className="max-h-[32rem] overflow-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
              No transactions yet.
            </p>
          ) : (
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const txn = items[virtualRow.index]!;
                // Viewing the account a transfer went into: show what arrived there.
                const received = Boolean(accountFilter && txn.toAccountId === accountFilter);
                const toAccount = txn.toAccountId ? accounts.data?.accounts.find((a) => a.id === txn.toAccountId) : undefined;
                return (
                  <div
                    key={txn.id}
                    className="absolute left-0 grid w-full grid-cols-[7rem_1fr_1fr_1fr_6rem_8rem_4rem] items-center border-b border-[var(--hairline)] px-4 text-sm last:border-0"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span className="font-mono tabular-nums text-[var(--muted-foreground)]">
                      {txn.date}
                    </span>
                    <span>{categoryName(txn.categoryId)}</span>
                    <span className="truncate text-[var(--muted-foreground)]">
                      {txn.toAccountId ? `${accountName(txn.accountId)} → ${accountName(txn.toAccountId)}` : accountName(txn.accountId)}
                    </span>
                    <span className="truncate text-[var(--muted-foreground)]">{txn.note ?? "—"}</span>
                    <span className="capitalize text-[var(--muted-foreground)]">{txn.type}</span>
                    <span className="text-right">
                      <MoneyText
                        amountMinor={
                          received ? txn.toAmountMinor ?? txn.amountMinor : txn.type === "expense" ? -txn.amountMinor : txn.amountMinor
                        }
                        currency={received ? toAccount?.currency ?? txn.currency : txn.currency}
                        tone={
                          txn.type === "income"
                            ? "positive"
                            : txn.type === "expense"
                              ? "negative"
                              : "default"
                        }
                      />
                    </span>
                    <span className="text-right">
                      <button
                        type="button"
                        className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]"
                        onClick={() => remove.mutate(txn.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
