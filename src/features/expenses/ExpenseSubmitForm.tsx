"use client";

import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { submitExpenseBodySchema } from "@/src/core/schemas/ledger";
import { COMMON_CURRENCIES } from "@/src/core/money";
import { isoDate } from "@/src/core/budgets/period";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Input, Label, Textarea } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";

type FormValues = {
  budgetPoolId: string;
  amountMajor: string;
  currency: string;
  categoryId: string;
  date: string;
  note: string;
};

type Props = {
  workspaceId: string;
  baseCurrency: string;
  defaultPoolId?: string;
};

export function ExpenseSubmitForm({
  workspaceId,
  baseCurrency,
  defaultPoolId = "",
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; key: string } | null>(null);

  const pools = useQuery({
    queryKey: qk.budgetPools(workspaceId),
    queryFn: () => api.listPools(workspaceId),
  });
  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
  });

  const form = useForm<FormValues>({
    defaultValues: {
      budgetPoolId: defaultPoolId,
      amountMajor: "",
      currency: baseCurrency,
      categoryId: "",
      date: isoDate(new Date()),
      note: "",
    },
  });

  // The <select> mounts before the pool options load, so the browser drops a
  // default it has no <option> for. Apply ?poolId= again once the pools arrive.
  const poolList = pools.data?.pools;
  useEffect(() => {
    if (!defaultPoolId || !poolList?.some((pool) => pool.id === defaultPoolId)) return;
    if (!form.getValues("budgetPoolId") || form.getValues("budgetPoolId") === defaultPoolId) {
      form.setValue("budgetPoolId", defaultPoolId);
    }
  }, [defaultPoolId, poolList, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = submitExpenseBodySchema.safeParse({
        budgetPoolId: values.budgetPoolId,
        amountMajor: values.amountMajor,
        currency: values.currency,
        categoryId: values.categoryId || null,
        date: values.date,
        note: values.note || null,
        receiptUrl: receipt?.url ?? null,
        receiptStorageKey: receipt?.key ?? null,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid expense");
      }
      return api.submitExpense(workspaceId, parsed.data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.approvals(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.budgetPools(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.notifications }),
      ]);
      router.push(`/w/${workspaceId}/expenses`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

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
    <PageContainer size="sm">
      <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--accent)]">EXPENSE</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Submit expense</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Submitted spend waits for an approver before it hits the pool.
      </p>
      <form
        className="mt-6 space-y-3"
        onSubmit={form.handleSubmit((values) => {
          setError(null);
          mutation.mutate(values);
        })}
      >
        <div>
          <Label htmlFor="pool">Budget pool</Label>
          <Select id="pool" {...form.register("budgetPoolId")} required>
            <option value="">Select</option>
            {(pools.data?.pools ?? []).map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              {...form.register("amountMajor")}
              required
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select id="currency" {...form.register("currency")}>
              {COMMON_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" {...form.register("categoryId")}>
            <option value="">None</option>
            {(categories.data?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...form.register("date")} required />
        </div>
        <div>
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" {...form.register("note")} />
        </div>
        <div>
          <Label htmlFor="receipt">Receipt</Label>
          <Input
            id="receipt"
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          {receipt ? (
            <p className="mt-1 font-mono text-[11px] text-[var(--balance-positive)]">Attached</p>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-[var(--balance-negative)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Submitting…" : "Submit for approval"}
        </Button>
      </form>
    </PageContainer>
  );
}
