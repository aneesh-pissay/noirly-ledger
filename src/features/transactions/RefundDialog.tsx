"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { createTransactionBodySchema } from "@/src/core/schemas/ledger";
import { formatMinorToMajor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { isoDate } from "@/src/core/budgets/period";
import type { Transaction } from "@/src/core/sync/types";
import { Button, Dialog, Input, Label } from "@noirly-dev/ui";

type Props = {
  workspaceId: string;
  /** The expense being refunded; null keeps the dialog closed. */
  expense: Transaction | null;
  onClose: () => void;
};

/** Money back on an expense: it lands in the expense's account and category, up to what's left of it. */
export function RefundDialog({ workspaceId, expense, onClose }: Props) {
  return (
    <Dialog open={Boolean(expense)} title="Refund" onClose={onClose}>
      {/* Keyed so each expense starts with its own amount left. */}
      {expense ? <RefundForm key={expense.id} workspaceId={workspaceId} expense={expense} onClose={onClose} /> : null}
    </Dialog>
  );
}

function RefundForm({ workspaceId, expense, onClose }: { workspaceId: string; expense: Transaction; onClose: () => void }) {
  const queryClient = useQueryClient();
  const left = expense.amountMinor - expense.refundedMinor;
  const { money } = useMoneyFormat();
  const [amount, setAmount] = useState(formatMinorToMajor(left));
  const [date, setDate] = useState(isoDate(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = createTransactionBodySchema.safeParse({
        type: "refund",
        refundOfId: expense.id,
        amountMajor: amount,
        currency: expense.currency,
        date,
        note: note || null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid refund");
      return api.createTransaction(workspaceId, parsed.data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.transactions(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) }),
      ]);
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        {expense.note ?? "Expense"} on {expense.date}: {money(left, expense.currency)} left to refund.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="refund-amount">Amount ({expense.currency})</Label>
          <Input id="refund-amount" inputMode="decimal" className="font-mono tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="refund-date">Date</Label>
          <Input id="refund-date" type="date" className="font-mono" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="refund-note">Note</Label>
        <Input id="refund-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error ? <p className="text-sm text-[var(--balance-negative)]">{error}</p> : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save refund"}
        </Button>
      </div>
    </form>
  );
}
