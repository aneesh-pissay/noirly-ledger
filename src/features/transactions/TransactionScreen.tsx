"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { MoneyText } from "@/src/components/MoneyText";
import { Button, PageContainer } from "@noirly-dev/ui";
import { useUIStore } from "@/src/stores/ui-store";
import type { Transaction } from "@/src/core/sync/types";
import { RefundDialog } from "@/src/features/transactions/RefundDialog";
import { CLEARING_LABEL } from "@/src/core/clearing";
import { filtersFromParams, filtersToQuery } from "@/src/core/search";
import { BulkBar } from "@/src/features/transactions/BulkBar";
import { BulkCreateDialog } from "@/src/features/transactions/BulkCreateDialog";
import { BillCalendar } from "@/src/features/bills/BillCalendar";
import { PaymentsPanel } from "@/src/features/bills/PaymentsPanel";
import { CashFlowPanel } from "@/src/features/accounts/CashFlowCard";
import { SpottedSubscriptions } from "@/src/features/bills/SpottedSubscriptions";
import { SubscriptionInsights } from "@/src/features/bills/SubscriptionInsights";
import { EmiPanel } from "@/src/features/installments/EmiPanel";
import { TransactionDetails } from "@/src/features/transactions/TransactionDetails";
import { DuplicatesPanel } from "@/src/features/transactions/DuplicatesPanel";
import { FiltersBar } from "@/src/features/transactions/FiltersBar";
import type { TransactionType } from "@/src/core/models/enums";
import { categoryTree } from "@/src/core/categories";

type Props = {
  workspaceId: string;
  baseCurrency: string;
  recurringOnly?: boolean;
  /** Where this list lives, for its filter links; a shared workspace's is under /w/:id. */
  basePath?: string;
};

export function TransactionScreen({
  workspaceId,
  baseCurrency,
  recurringOnly = false,
  basePath,
}: Props) {
  const setOpen = useUIStore((s) => s.setTransactionComposerOpen);
  const [bulkAdding, setBulkAdding] = useState(false);
  const queryClient = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);
  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
  });
  // The list's search and filters live in the address (?q=…&account=…), so links from Accounts, Projects and the rows here, and saved views, all just open it.
  const search = useSearchParams();
  const filters = filtersFromParams(search);
  const accountFilter = filters.account;
  const tagFilter = filters.tag;
  const merchantFilter = filters.merchant;
  const projectFilter = filters.project;
  const listQuery = {
    accountId: accountFilter,
    tag: tagFilter,
    merchant: merchantFilter,
    projectId: projectFilter,
    categoryId: filters.category,
    q: filters.q,
    type: filters.type as TransactionType | undefined,
    from: filters.from,
    to: filters.to,
    min: filters.min,
    max: filters.max,
    clearing: filters.clearing,
  };
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId) });
  const accounts = useQuery({
    queryKey: qk.accounts(workspaceId),
    queryFn: () => api.listAccounts(workspaceId),
  });
  const txns = useQuery({
    queryKey: qk.transactions(workspaceId, { recurring: recurringOnly, ...listQuery }),
    queryFn: () => api.listTransactions(workspaceId, { recurring: recurringOnly, ...listQuery, limit: 200 }),
  });
  const accountName = (id: string | null) =>
    id ? accounts.data?.accounts.find((a) => a.id === id)?.name ?? "Account" : "—";
  const projectName = (id: string | null) => (id ? projects.data?.projects.find((p) => p.id === id)?.name ?? "Project" : null);
  const base = basePath ?? (recurringOnly ? "/recurring" : "/transactions");
  const showing = [
    accountFilter ? accounts.data?.accounts.find((a) => a.id === accountFilter)?.name ?? "one account" : null,
    tagFilter ? `#${tagFilter}` : null,
    merchantFilter ?? null,
    projectFilter ? projectName(projectFilter) : null,
  ].filter(Boolean);

  const [refunding, setRefunding] = useState<Transaction | null>(null);
  const [details, setDetails] = useState<Transaction | null>(null);
  // Picked rows for bulk changes; a new search starts with none picked.
  const [selected, setSelected] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const selectionKey = filtersToQuery(filters);
  const picked = selected.key === selectionKey ? selected.ids : new Set<string>();
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected({ key: selectionKey, ids: next });
  };
  const setClearing = useMutation({
    mutationFn: ({ id, clearing }: { id: string; clearing: "pending" | "cleared" }) => api.updateTransaction(id, { clearing }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) }),
      ]),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["duplicates", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["bills", workspaceId] }),
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

  const categoryLabels = new Map(categoryTree(categories.data?.categories ?? []).map((c) => [c.id, c.label]));
  const categoryName = (id: string | null) => (id ? categoryLabels.get(id) : undefined) ?? "Uncategorized";

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
          {showing.length ? (
            <p className="mt-1 text-sm">
              Showing {showing.join(", ")} ·{" "}
              <Link href={base} className="underline">Show all</Link>
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {!recurringOnly ? <Link href={`${base}/import`} className="inline-flex items-center px-3 text-sm underline">Import statement</Link> : null}
          {!recurringOnly ? <Link href={`${base}/receipts`} className="inline-flex items-center px-3 text-sm underline">Match receipts</Link> : null}
          {!recurringOnly ? <Button variant="ghost" onClick={() => setBulkAdding(true)}>Add several</Button> : null}
          <Button onClick={() => setOpen(true)}>Add</Button>
        </div>
      </div>
      <BulkCreateDialog workspaceId={workspaceId} baseCurrency={baseCurrency} open={bulkAdding} onClose={() => setBulkAdding(false)} categories={categories.data?.categories ?? []} />
      {picked.size ? (
        <BulkBar
          workspaceId={workspaceId}
          selectedIds={[...picked]}
          categories={categories.data?.categories ?? []}
          projects={projects.data?.projects ?? []}
          onDone={() => setSelected({ key: selectionKey, ids: new Set() })}
        />
      ) : null}
      {!recurringOnly ? <DuplicatesPanel workspaceId={workspaceId} accountName={accountName} /> : null}
      {!recurringOnly ? (
        <FiltersBar workspaceId={workspaceId} basePath={base} filters={filters} categories={categories.data?.categories ?? []} />
      ) : null}
      {remove.error || setClearing.error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">
          {(remove.error ?? setClearing.error)?.message ?? "Couldn't save"}
        </p>
      ) : null}
      <RefundDialog workspaceId={workspaceId} expense={refunding} onClose={() => setRefunding(null)} />
      <TransactionDetails
        workspaceId={workspaceId}
        transaction={details}
        onClose={() => setDetails(null)}
        categoryName={categoryName}
        accountName={accountName}
        projectName={projectName}
      />
      {recurringOnly ? (
        <div className="mt-6 space-y-6">
          <BillCalendar workspaceId={workspaceId} />
          <PaymentsPanel workspaceId={workspaceId} baseCurrency={baseCurrency} />
          <CashFlowPanel workspaceId={workspaceId} />
          <SubscriptionInsights workspaceId={workspaceId} />
          <SpottedSubscriptions workspaceId={workspaceId} />
          <EmiPanel workspaceId={workspaceId} baseCurrency={baseCurrency} />
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--hairline)]">
        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_6rem_6rem_7rem_9rem] gap-x-3 border-b border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label="Select all shown"
              checked={items.length > 0 && items.every((t) => picked.has(t.id))}
              onChange={(e) => setSelected({ key: selectionKey, ids: e.target.checked ? new Set(items.map((t) => t.id)) : new Set() })}
            />
            Date
          </span>
          <span>Category</span>
          <span>Account</span>
          <span>Details</span>
          <span>Type</span>
          <span>Status</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <div ref={parentRef} className="max-h-[32rem] overflow-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
              {Object.keys(filters).length ? "Nothing matches this search." : "No transactions yet."}
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
                const refundable = txn.type === "expense" && txn.isPosted && !txn.budgetPoolId && txn.refundedMinor < txn.amountMinor;
                return (
                  <div
                    key={txn.id}
                    className="absolute left-0 grid w-full grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_6rem_6rem_7rem_9rem] gap-x-3 items-center border-b border-[var(--hairline)] px-4 text-sm last:border-0"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span className="flex items-center gap-2 font-mono tabular-nums text-[var(--muted-foreground)]">
                      <input type="checkbox" aria-label={`Select ${txn.date} ${txn.note ?? txn.merchant ?? txn.type}`} checked={picked.has(txn.id)} onChange={() => toggle(txn.id)} />
                      {txn.date}
                    </span>
                    {txn.splits.length ? (
                      <span className="truncate" title={txn.splits.map((line) => categoryName(line.categoryId)).join(", ")}>
                        Split <span className="text-[var(--muted-foreground)]">· {txn.splits.map((line) => categoryName(line.categoryId)).join(", ")}</span>
                      </span>
                    ) : (
                      <span className="truncate">{categoryName(txn.categoryId)}</span>
                    )}
                    <span className="truncate text-[var(--muted-foreground)]">
                      {txn.toAccountId ? `${accountName(txn.accountId)} → ${accountName(txn.toAccountId)}` : accountName(txn.accountId)}
                    </span>
                    {/* Merchant and note on top; project and tags underneath, so neither crowds the other out. */}
                    <span className="flex min-w-0 flex-col text-[var(--muted-foreground)]">
                      <span className="truncate">
                        {txn.merchant ? (
                          <Link href={`${base}?merchant=${encodeURIComponent(txn.merchant)}`} className="font-medium text-[var(--foreground)] hover:underline">
                            {txn.merchant}
                          </Link>
                        ) : null}
                        {txn.merchant && txn.note ? " · " : null}
                        {txn.note ?? (txn.merchant ? null : "—")}
                      </span>
                      {txn.projectId || txn.tags.length ? (
                        <span className="flex gap-2 truncate text-[11px] leading-4">
                          {txn.projectId ? (
                            <Link href={`${base}?project=${txn.projectId}`} className="hover:underline">{projectName(txn.projectId)}</Link>
                          ) : null}
                          {txn.tags.map((tag) => (
                            <Link key={tag} href={`${base}?tag=${encodeURIComponent(tag)}`} className="font-mono hover:underline">#{tag}</Link>
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[var(--muted-foreground)]">
                      {txn.type === "expense" && txn.refundedMinor
                        ? txn.refundedMinor >= txn.amountMinor ? "Refunded" : "Part refunded"
                        : txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                    </span>
                    <span>
                      {!txn.isPosted ? (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      ) : txn.clearing === "reconciled" ? (
                        <span className="text-xs text-[var(--muted-foreground)]" title="Matched to a statement">{CLEARING_LABEL.reconciled}</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Mark ${txn.clearing === "pending" ? "cleared" : "pending"}`}
                          disabled={setClearing.isPending}
                          className={`rounded-full border border-[var(--hairline)] px-2 py-0.5 text-xs ${txn.clearing === "pending" ? "text-[var(--muted-foreground)]" : "text-[var(--balance-positive)]"}`}
                          onClick={() => setClearing.mutate({ id: txn.id, clearing: txn.clearing === "pending" ? "cleared" : "pending" })}
                        >
                          {CLEARING_LABEL[txn.clearing]}
                        </button>
                      )}
                    </span>
                    <span className="text-right">
                      <MoneyText
                        amountMinor={
                          received ? txn.toAmountMinor ?? txn.amountMinor : txn.type === "expense" ? -txn.amountMinor : txn.amountMinor
                        }
                        currency={received ? toAccount?.currency ?? txn.currency : txn.currency}
                        tone={
                          txn.type === "income" || txn.type === "refund"
                            ? "positive"
                            : txn.type === "expense"
                              ? "negative"
                              : "default"
                        }
                      />
                    </span>
                    <span className="flex justify-end gap-3">
                      <button
                        type="button"
                        aria-label={`Details for ${txn.date} ${txn.note ?? txn.merchant ?? txn.type}`}
                        className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        onClick={() => setDetails(txn)}
                      >
                        Details{txn.attachmentCount ? ` · ${txn.attachmentCount}` : ""}
                      </button>
                      {refundable ? (
                        <button
                          type="button"
                          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          onClick={() => setRefunding(txn)}
                        >
                          Refund
                        </button>
                      ) : null}
                      {/* Reconciled ones are marked cleared before they can go. */}
                      {txn.clearing !== "reconciled" ? (
                        <button
                          type="button"
                          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]"
                          onClick={() => remove.mutate(txn.id)}
                        >
                          Delete
                        </button>
                      ) : null}
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
