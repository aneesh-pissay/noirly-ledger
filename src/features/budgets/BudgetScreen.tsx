"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Input, Label } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";
import { ProgressBar } from "@/src/components/ProgressBar";
import { MoneyText } from "@/src/components/MoneyText";
import { categoryTree } from "@/src/core/categories";

type Props = { workspaceId: string; baseCurrency: string };

export function BudgetScreen({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [limitMajor, setLimitMajor] = useState("");
  const [period, setPeriod] = useState<"monthly" | "weekly" | "yearly">("monthly");

  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
  });
  const dashboard = useQuery({
    queryKey: qk.dashboard(workspaceId, "mtd"),
    queryFn: () => api.dashboard(workspaceId, "mtd"),
  });

  const save = useMutation({
    mutationFn: () =>
      api.upsertBudget(workspaceId, { categoryId, period, limitMajor, currency: baseCurrency }),
    onSuccess: () => {
      setLimitMajor("");
      void queryClient.invalidateQueries({ queryKey: qk.dashboard(workspaceId, "mtd") });
      void queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) });
    },
  });

  const rows = dashboard.data?.summary.budgets ?? [];
  const categoryName = useMemo(() => {
    const map = new Map(categoryTree(categories.data?.categories ?? []).map((c) => [c.id, c]));
    return (id: string) => map.get(id)?.label ?? "Category";
  }, [categories.data]);

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
      <form
        className="mt-6 grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-4 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="sm:col-span-2">
          <Label htmlFor="b-cat">Category</Label>
          <Select
            id="b-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            <option value="">Select</option>
            {categoryTree(categories.data?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="b-period">Period</Label>
          <Select
            id="b-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as "monthly" | "weekly" | "yearly")}
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="yearly">Yearly (financial year)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="b-limit">Limit ({baseCurrency})</Label>
          <Input
            id="b-limit"
            className="font-mono"
            value={limitMajor}
            onChange={(e) => setLimitMajor(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="sm:col-span-4" disabled={save.isPending}>
          Save budget
        </Button>
      </form>

      <ul className="mt-8 space-y-4">
        {rows.map((row) => {
          const ratio = row.budget.limitAmountMinor
            ? row.spentMinor / row.budget.limitAmountMinor
            : 0;
          const over = ratio > 1;
          return (
            <li key={row.budget.id} className="surface grain rounded-[var(--r-lg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{categoryName(row.budget.categoryId)}</p>
                <p className="font-mono text-xs text-[var(--muted-foreground)]">
                  <span className="uppercase">{row.budget.period}</span> · {row.periodFrom} to {row.periodTo}
                </p>
              </div>
              <div className="mt-3">
                <ProgressBar value={ratio} tone={over ? "negative" : "accent"} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-[var(--muted-foreground)]">
                <MoneyText amountMinor={row.spentMinor} currency={row.budget.currency} />
                <MoneyText
                  amountMinor={row.remainingMinor}
                  currency={row.budget.currency}
                  tone={over ? "negative" : "positive"}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
