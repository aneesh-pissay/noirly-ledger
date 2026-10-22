"use client";

import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { createTransactionBodySchema } from "@/src/core/schemas/ledger";
import { COMMON_CURRENCIES } from "@/src/core/money";
import { isoDate } from "@/src/core/budgets/period";
import { Button, Dialog } from "@noirly-dev/ui";
import { Input, Label, Textarea } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";
import { useUIStore } from "@/src/stores/ui-store";
import { categoryTree } from "@/src/core/categories";

type FormValues = {
  type: "expense" | "income" | "transfer";
  amountMajor: string;
  currency: string;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  toAmountMajor: string;
  date: string;
  note: string;
  frequency: "" | "daily" | "weekly" | "monthly" | "yearly";
  clearing: "cleared" | "pending";
};

type Props = {
  workspaceId: string;
  baseCurrency: string;
};

export function TransactionComposer({ workspaceId, baseCurrency }: Props) {
  const open = useUIStore((s) => s.transactionComposerOpen);
  const setOpen = useUIStore((s) => s.setTransactionComposerOpen);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; key: string } | null>(null);

  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
    enabled: open,
  });

  const accounts = useQuery({
    queryKey: qk.accounts(workspaceId),
    queryFn: () => api.listAccounts(workspaceId),
    enabled: open,
  });
  const openAccounts = (accounts.data?.accounts ?? []).filter((account) => !account.archived);

  const form = useForm<FormValues>({
    defaultValues: {
      type: "expense",
      amountMajor: "",
      currency: baseCurrency,
      categoryId: "",
      accountId: "",
      toAccountId: "",
      toAmountMajor: "",
      date: isoDate(new Date()),
      note: "",
      frequency: "",
      clearing: "cleared",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const transfer = values.type === "transfer";
      const from = openAccounts.find((account) => account.id === values.accountId);
      const to = transfer ? openAccounts.find((account) => account.id === values.toAccountId) : undefined;
      const parsed = createTransactionBodySchema.safeParse({
        type: values.type,
        amountMajor: values.amountMajor,
        // The currency select is locked (and left out of the values) while an account is chosen.
        currency: openAccounts.find((account) => account.id === values.accountId)?.currency ?? values.currency,
        // A transfer moves money between your accounts; it isn't spending in a category.
        categoryId: transfer ? null : values.categoryId || null,
        accountId: values.accountId || null,
        toAccountId: to?.id ?? null,
        toAmountMajor: to && from && to.currency !== from.currency ? values.toAmountMajor : null,
        date: values.date,
        note: values.note || null,
        receiptUrl: receipt?.url ?? null,
        receiptStorageKey: receipt?.key ?? null,
        clearing: values.clearing,
        recurrence: values.frequency
          ? { frequency: values.frequency, interval: 1 }
          : null,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid transaction");
      }
      return api.createTransaction(workspaceId, parsed.data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.transactions(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) }),
      ]);
      form.reset({
        type: "expense",
        amountMajor: "",
        currency: baseCurrency,
        categoryId: "",
        accountId: form.getValues("accountId"),
        toAccountId: "",
        toAmountMajor: "",
        date: isoDate(new Date()),
        note: "",
        frequency: "",
        clearing: "cleared",
      });
      setReceipt(null);
      setOpen(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const accountId = useWatch({ control: form.control, name: "accountId" });
  const chosenAccount = openAccounts.find((account) => account.id === accountId);
  const isTransfer = useWatch({ control: form.control, name: "type" }) === "transfer";
  const toAccountId = useWatch({ control: form.control, name: "toAccountId" });
  const toAccount = openAccounts.find((account) => account.id === toAccountId);
  const crossCurrency = Boolean(isTransfer && chosenAccount && toAccount && chosenAccount.currency !== toAccount.currency);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const saved = await api.uploadReceipt(workspaceId, file);
      setReceipt(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <Dialog open={open} title="Add transaction" onClose={() => setOpen(false)}>
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit((values) => {
          setError(null);
          mutation.mutate(values);
        })}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" {...form.register("type")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              className="font-mono tabular-nums"
              placeholder="0.00"
              {...form.register("amountMajor")}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="currency">Currency</Label>
            {/* An account's transactions are in its currency. */}
            <Select id="currency" disabled={Boolean(chosenAccount)} {...form.register("currency")}>
              {COMMON_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" className="font-mono" {...form.register("date")} />
          </div>
        </div>
        {openAccounts.length ? (
          <div className={isTransfer ? "grid grid-cols-2 gap-3" : undefined}>
          <div>
            <Label htmlFor="account">{isTransfer ? "From" : "Account"}</Label>
            <Select id="account" {...form.register("accountId", {
              onChange: (event) => {
                const account = openAccounts.find((a) => a.id === event.target.value);
                if (account) form.setValue("currency", account.currency);
              },
            })}>
              <option value="">No account</option>
              {openAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
              ))}
            </Select>
          </div>
          {isTransfer ? (
            <div>
              <Label htmlFor="to-account">To</Label>
              <Select id="to-account" {...form.register("toAccountId")}>
                <option value="">Choose an account</option>
                {openAccounts.filter((account) => account.id !== accountId).map((account) => (
                  <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                ))}
              </Select>
            </div>
          ) : null}
          </div>
        ) : null}
        {crossCurrency ? (
          <div>
            <Label htmlFor="to-amount">Amount received ({toAccount!.currency})</Label>
            <Input id="to-amount" inputMode="decimal" className="font-mono tabular-nums" placeholder="0.00" {...form.register("toAmountMajor")} />
          </div>
        ) : null}
        {isTransfer ? null : <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" {...form.register("categoryId")}>
            <option value="">Uncategorized</option>
            {categoryTree(categories.data?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </div>}
        <div>
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" {...form.register("note")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="frequency">Recurring</Label>
            <Select id="frequency" {...form.register("frequency")}>
              <option value="">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="clearing">Status</Label>
            <Select id="clearing" {...form.register("clearing")}>
              <option value="cleared">Cleared</option>
              <option value="pending">Pending</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="receipt">Receipt (optional)</Label>
          <Input
            id="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          {receipt ? (
            <p className="mt-1 font-mono text-[11px] text-[var(--balance-positive)]">Receipt attached</p>
          ) : null}
        </div>
        {error ? <p className="text-sm text-[var(--balance-negative)]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
