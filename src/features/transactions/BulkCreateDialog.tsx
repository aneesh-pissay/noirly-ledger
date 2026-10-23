"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Input } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { isoDate } from "@/src/core/budgets/period";
import { COMMON_CURRENCIES } from "@/src/core/money";
import { MAX_BULK_CREATE } from "@/src/core/bulk";
import { Select } from "@/src/components/Select";
import type { Category } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  baseCurrency: string;
  open: boolean;
  onClose: () => void;
  categories: Category[];
};

type Row = { date: string; type: "expense" | "income"; amountMajor: string; currency: string; categoryId: string; note: string };

const blank = (currency: string): Row => ({ date: isoDate(new Date()), type: "expense", amountMajor: "", currency, categoryId: "", note: "" });

/** A grid for typing in several transactions at once; they're added together, or none are. Empty rows are skipped. */
export function BulkCreateDialog({ workspaceId, baseCurrency, open, onClose, categories }: Props) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, () => blank(baseCurrency)));
  const [error, setError] = useState<string | null>(null);
  const filled = rows.filter((row) => row.amountMajor.trim());
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const save = useMutation({
    mutationFn: () =>
      api.bulkCreateTransactions(
        workspaceId,
        filled.map((row) => ({
          type: row.type,
          amountMajor: row.amountMajor.trim(),
          currency: row.currency,
          date: row.date,
          categoryId: row.categoryId || null,
          note: row.note.trim() || null,
        })),
      ),
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) });
      setRows(Array.from({ length: 5 }, () => blank(baseCurrency)));
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog open={open} title="Add several transactions" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); if (filled.length) save.mutate(); }}
      >
        <div className="max-h-[50vh] space-y-2 overflow-auto">
          {rows.map((row, i) => (
            // Two lines a row: when and how much, then what for; the dialog is too narrow for one.
            <div key={i} data-bulk-row={i + 1} className="grid grid-cols-4 gap-2 border-b border-[var(--hairline)] pb-2 last:border-0">
              <Input aria-label={`Row ${i + 1} date`} type="date" className="font-mono text-xs" value={row.date} onChange={(e) => set(i, { date: e.target.value })} />
              <Select aria-label={`Row ${i + 1} type`} className="text-xs" value={row.type} onChange={(e) => set(i, { type: e.target.value as Row["type"] })}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
              <Input aria-label={`Row ${i + 1} amount`} inputMode="decimal" className="font-mono text-xs" placeholder="0.00" value={row.amountMajor} onChange={(e) => set(i, { amountMajor: e.target.value })} />
              <Select aria-label={`Row ${i + 1} currency`} className="text-xs" value={row.currency} onChange={(e) => set(i, { currency: e.target.value })}>
                {[...new Set([baseCurrency, ...COMMON_CURRENCIES])].map((code) => <option key={code} value={code}>{code}</option>)}
              </Select>
              <div className="col-span-4 grid grid-cols-2 gap-2">
                <Select aria-label={`Row ${i + 1} category`} className="text-xs" value={row.categoryId} onChange={(e) => set(i, { categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {categoryTree(categories).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
                <Input aria-label={`Row ${i + 1} note`} className="text-xs" placeholder="Note" value={row.note} onChange={(e) => set(i, { note: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-xs underline disabled:opacity-40"
            disabled={rows.length >= MAX_BULK_CREATE}
            onClick={() => setRows([...rows, { ...blank(baseCurrency), date: rows.at(-1)?.date ?? isoDate(new Date()), currency: rows.at(-1)?.currency ?? baseCurrency }])}
          >
            Add row
          </button>
          <p className="text-xs text-[var(--muted-foreground)]">{filled.length} to add; rows without an amount are skipped.</p>
        </div>
        {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!filled.length || save.isPending}>{save.isPending ? "Adding…" : `Add ${filled.length || ""}`.trim()}</Button>
        </div>
      </form>
    </Dialog>
  );
}
