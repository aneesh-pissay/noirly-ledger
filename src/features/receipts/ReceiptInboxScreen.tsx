"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { formatMinorToMajor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import type { InboxReceipt } from "@/src/core/sync/types";

type Props = { workspaceId: string; transactionsPath: string };

/** /transactions/receipts — upload a pile of receipts, then match each to its transaction by amount and date. */
export function ReceiptInboxScreen({ workspaceId, transactionsPath }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inbox = useQuery({ queryKey: ["receipt-inbox", workspaceId], queryFn: () => api.listReceiptInbox(workspaceId) });
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const accountName = (id: string | null) => (id ? accounts.data?.accounts.find((a) => a.id === id)?.name ?? "Account" : null);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["receipt-inbox", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] }),
    ]);
  const handlers = { onMutate: () => setError(null), onError: (err: Error) => setError(err.message) };

  const upload = useMutation({
    mutationFn: (files: File[]) => api.uploadReceiptsToInbox(workspaceId, files),
    ...handlers,
    onSuccess: ({ uploaded }) => {
      setMessage(`Uploaded ${uploaded} receipt${uploaded === 1 ? "" : "s"}.`);
      return refresh();
    },
  });
  const matchAll = useMutation({
    mutationFn: () => api.matchAllReceipts(workspaceId),
    ...handlers,
    onSuccess: ({ matched }) => {
      setMessage(matched ? `Matched ${matched} receipt${matched === 1 ? "" : "s"}.` : "None stood out; pick their transactions below.");
      return refresh();
    },
  });
  const edit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateInboxReceipt>[1] }) => api.updateInboxReceipt(id, patch),
    ...handlers,
    onSuccess: refresh,
  });
  const match = useMutation({
    mutationFn: ({ id, transactionId }: { id: string; transactionId: string }) => api.matchReceipt(id, transactionId),
    ...handlers,
    onSuccess: () => {
      setMessage("Receipt attached.");
      return refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteInboxReceipt(id), ...handlers, onSuccess: refresh });

  const receipts = inbox.data?.receipts ?? [];
  const open = receipts.filter((r) => !r.transactionId);
  const matched = receipts.filter((r) => r.transactionId);
  const busy = edit.isPending || match.isPending || remove.isPending;

  const card = (receipt: InboxReceipt) => {
    const amountText = receipt.amountMinor == null ? "" : formatMinorToMajor(receipt.amountMinor);
    return (
      <li key={receipt.id} data-receipt={receipt.name} className="space-y-3 rounded-xl border border-[var(--hairline)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <a href={receipt.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium underline">{receipt.name}</a>
          <button type="button" className="text-xs underline" disabled={busy} onClick={() => remove.mutate(receipt.id)}>Remove</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_9rem_minmax(0,1fr)]">
          <div>
            <Label htmlFor={`date-${receipt.id}`}>Date</Label>
            <Input key={`date-${receipt.date}`} id={`date-${receipt.id}`} aria-label={`Date of ${receipt.name}`} type="date" defaultValue={receipt.date ?? ""}
              onBlur={(e) => { if (e.target.value !== (receipt.date ?? "")) edit.mutate({ id: receipt.id, patch: { date: e.target.value || null } }); }} />
          </div>
          <div>
            <Label htmlFor={`amount-${receipt.id}`}>Amount</Label>
            <Input key={`amount-${receipt.amountMinor}`} id={`amount-${receipt.id}`} aria-label={`Amount of ${receipt.name}`} inputMode="decimal" defaultValue={amountText}
              onBlur={(e) => { if (e.target.value.trim() !== amountText) edit.mutate({ id: receipt.id, patch: { amountMajor: e.target.value.trim() || null } }); }} />
          </div>
          <div>
            <Label htmlFor={`shop-${receipt.id}`}>Shop</Label>
            <Input key={`shop-${receipt.merchant}`} id={`shop-${receipt.id}`} aria-label={`Shop on ${receipt.name}`} maxLength={80} defaultValue={receipt.merchant ?? ""}
              onBlur={(e) => { if (e.target.value.trim() !== (receipt.merchant ?? "")) edit.mutate({ id: receipt.id, patch: { merchant: e.target.value.trim() || null } }); }} />
          </div>
        </div>
        {receipt.amountMinor == null ? (
          <p className="text-xs text-[var(--muted-foreground)]">Add its amount to find its transaction.</p>
        ) : receipt.suggestions.length ? (
          <ul aria-label={`Transactions for ${receipt.name}`} className="divide-y divide-[var(--hairline)] text-sm">
            {receipt.suggestions.map((t, i) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <span className="font-mono text-xs tabular-nums text-[var(--muted-foreground)]">{t.date}</span>
                <span className="min-w-0 flex-1 truncate">
                  {[t.merchant, t.note].filter(Boolean).join(" · ") || "No note"}
                  {accountName(t.accountId) ? <span className="text-xs text-[var(--muted-foreground)]"> · {accountName(t.accountId)}</span> : null}
                  {t.receiptUrl ? <span className="text-xs text-[var(--muted-foreground)]"> · has a receipt</span> : null}
                </span>
                <span className="font-mono tabular-nums">{money(t.amountMinor, t.currency)}</span>
                <Button variant={i === 0 ? undefined : "ghost"} disabled={busy} onClick={() => match.mutate({ id: receipt.id, transactionId: t.id })}>
                  Attach
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">No transaction for {receipt.currency ? money(receipt.amountMinor, receipt.currency) : amountText}{receipt.date ? " within a few days of this date" : ""} yet.</p>
        )}
      </li>
    );
  };

  return (
    <PageContainer size="lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Match receipts</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Upload receipts in bulk, then attach each to its transaction by amount and date. Dates, amounts and shops are read from file names like &ldquo;2026-10-01 Swiggy 450.pdf&rdquo;; type in any that are missing.
          </p>
        </div>
        <Link href={transactionsPath} className="shrink-0 text-sm underline">Back to transactions</Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 surface grain rounded-[var(--r-lg)] p-4">
        <div>
          <Label htmlFor="receipt-files">Receipt files</Label>
          <input
            id="receipt-files"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="block text-sm"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length) upload.mutate(files);
              e.target.value = "";
            }}
          />
        </div>
        {upload.isPending ? <p className="text-sm text-[var(--muted-foreground)]">Uploading…</p> : null}
        {open.length ? (
          <Button variant="ghost" disabled={matchAll.isPending || busy} onClick={() => matchAll.mutate()}>
            {matchAll.isPending ? "Matching…" : "Match the clear ones"}
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}

      <section aria-label="To match" className="mt-6">
        <h2 className="text-sm font-medium">To match ({open.length})</h2>
        {open.length ? <ul className="mt-2 space-y-3">{open.map(card)}</ul> : <p className="mt-2 text-sm text-[var(--muted-foreground)]">Nothing waiting.</p>}
      </section>

      {matched.length ? (
        <section aria-label="Matched" className="mt-8">
          <h2 className="text-sm font-medium">Recently matched</h2>
          <ul className="mt-2 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {matched.map((r) => (
              <li key={r.id} data-matched-receipt={r.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
                <a href={r.url} target="_blank" rel="noreferrer" className="truncate underline">{r.name}</a>
                <span className="text-xs text-[var(--muted-foreground)]">
                  Attached{r.amountMinor != null ? ` · ${r.currency ? money(r.amountMinor, r.currency) : formatMinorToMajor(r.amountMinor)}` : ""}{r.date ? ` · ${r.date}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageContainer>
  );
}
