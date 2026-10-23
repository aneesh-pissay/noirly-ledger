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
import { ROLLOVER_LABEL, ROLLOVER_MODES, type RolloverMode } from "@/src/core/budgets/rollover";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { PlanPanel } from "@/src/features/budgets/PlanPanel";

type Props = { workspaceId: string; baseCurrency: string };

export function BudgetScreen({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [limitMajor, setLimitMajor] = useState("");
  const [period, setPeriod] = useState<"monthly" | "weekly" | "yearly">("monthly");
  const [rollover, setRollover] = useState<RolloverMode>("none");
  // Empty means "from the start of this period".
  const [rolloverSince, setRolloverSince] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { money } = useMoneyFormat();

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
      api.upsertBudget(workspaceId, {
        categoryId,
        period,
        limitMajor,
        currency: baseCurrency,
        rollover,
        rolloverSince: rollover !== "none" && rolloverSince ? rolloverSince : null,
      }),
    onMutate: () => setError(null),
    onError: (err: Error) => setError(err.message),
    onSuccess: () => {
      setLimitMajor("");
      setRolloverSince("");
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
        <div className="sm:col-span-2">
          <Label htmlFor="b-rollover">At the end of a period</Label>
          <Select id="b-rollover" value={rollover} onChange={(e) => setRollover(e.target.value as RolloverMode)}>
            {ROLLOVER_MODES.map((mode) => <option key={mode} value={mode}>{ROLLOVER_LABEL[mode]}</option>)}
          </Select>
        </div>
        {rollover !== "none" ? (
          <div className="sm:col-span-2">
            <Label htmlFor="b-since">Carry from (optional)</Label>
            <Input id="b-since" type="date" className="font-mono" value={rolloverSince} onChange={(e) => setRolloverSince(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Leave empty to start carrying from this period.</p>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-[var(--balance-negative)] sm:col-span-4">{error}</p> : null}
        <Button type="submit" className="sm:col-span-4" disabled={save.isPending}>
          Save budget
        </Button>
      </form>

      <PlanPanel workspaceId={workspaceId} baseCurrency={baseCurrency} />

      <ul className="mt-8 space-y-4">
        {rows.map((row) => {
          // Measured against what's available: the limit plus anything carried in.
          const ratio = row.availableMinor > 0 ? row.spentMinor / row.availableMinor : row.spentMinor > 0 ? Infinity : 0;
          const over = ratio > 1;
          return (
            <li key={row.budget.id} data-budget={categoryName(row.budget.categoryId)} className="surface grain rounded-[var(--r-lg)] p-4">
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
              {row.budget.rollover !== "none" ? (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  {row.carriedInMinor === 0
                    ? "Nothing carried in"
                    : row.carriedInMinor > 0
                      ? `${money(row.carriedInMinor, row.budget.currency)} carried in, ${money(row.availableMinor, row.budget.currency)} available`
                      : `${money(-row.carriedInMinor, row.budget.currency)} overspent before, ${money(row.availableMinor, row.budget.currency)} available`}
                  {row.budget.rolloverSince ? ` · counting from ${row.budget.rolloverSince}` : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
