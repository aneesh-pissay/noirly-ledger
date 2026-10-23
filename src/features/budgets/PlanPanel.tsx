"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { formatMinorToMajor, parseMajorToMinor } from "@/src/core/money";
import { MONTH_NAMES } from "@/src/core/locale-format";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { workspaceId: string; baseCurrency: string };

function shiftMonth(month: string, by: number) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, m - 1 + by, 1)).toISOString().slice(0, 7);
}

function monthName(month: string) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

/** Reads an amount box: empty is zero, anything unreadable is null. */
function readMinor(text: string) {
  try {
    return text.trim() ? parseMajorToMinor(text.trim()) : 0;
  } catch {
    return null;
  }
}

/**
 * Zero-based plan for a month: the income to plan with, a monthly amount for
 * each category (its monthly budget), and what's left until every unit of
 * income has a job.
 */
export function PlanPanel({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const plan = useQuery({ queryKey: qk.monthPlan(workspaceId, month), queryFn: () => api.getMonthPlan(workspaceId, month) });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
    ]);

  const income = useMutation({
    mutationFn: (text: string) => api.setExpectedIncome(workspaceId, month, text.trim() || null),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });
  const assign = useMutation({
    // Zero clears the category's monthly budget; anything else sets it.
    mutationFn: async ({ categoryId, budgetId, minor }: { categoryId: string; budgetId: string | null; minor: number }) => {
      if (minor !== 0) await api.upsertBudget(workspaceId, { categoryId, period: "monthly", limitMajor: formatMinorToMajor(minor), currency: baseCurrency });
      else if (budgetId) await api.deleteBudget(budgetId);
    },
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const data = plan.data?.plan;
  const lines = new Map((data?.lines ?? []).map((line) => [line.categoryId, line]));
  const tree = categoryTree((categories.data?.categories ?? []).filter((c) => c.isSystem ? c.name !== "Income" && c.name !== "Transfer" : true));

  return (
    <section aria-label="Monthly plan" className="mt-8 surface grain rounded-[var(--r-lg)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Plan {monthName(month)}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">Give every unit of income a job: assign it to categories until nothing is left.</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
        </div>
      </div>

      {data ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
            <div>
              <Label htmlFor="plan-income">Income to plan with ({data.baseCurrency})</Label>
              <Input
                key={`${month}-${data.expectedIncomeMinor ?? "none"}`}
                id="plan-income"
                inputMode="decimal"
                className="font-mono"
                placeholder={formatMinorToMajor(data.receivedIncomeMinor)}
                defaultValue={data.expectedIncomeMinor == null ? "" : formatMinorToMajor(data.expectedIncomeMinor)}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  const current = data.expectedIncomeMinor == null ? "" : formatMinorToMajor(data.expectedIncomeMinor);
                  if (next !== current) income.mutate(next);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Received so far: {money(data.receivedIncomeMinor, data.baseCurrency)}.{data.expectedIncomeMinor == null ? " Leave empty to plan with that." : ""}
              </p>
            </div>
            <p
              role="status"
              data-plan-state={data.state}
              className={`text-right font-mono text-sm ${data.state === "overassigned" ? "text-[var(--balance-negative)]" : data.state === "balanced" ? "text-[var(--balance-positive)]" : ""}`}
            >
              {data.state === "balanced"
                ? "Every bit of income has a job"
                : data.state === "unassigned"
                  ? `${money(data.leftMinor, data.baseCurrency)} left to assign`
                  : `${money(-data.leftMinor, data.baseCurrency)} more assigned than income`}
              <span className="block text-xs text-[var(--muted-foreground)]">
                {money(data.assignedMinor, data.baseCurrency)} assigned of {money(data.incomeMinor, data.baseCurrency)}
              </span>
            </p>
          </div>

          <ul aria-label="Assigned this month" className="mt-4 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {tree.map((category) => {
              const line = lines.get(category.id);
              const fromOthers = line ? line.monthlyMinor - (line.monthlyLimitMinor ?? 0) : 0;
              return (
                <li key={category.id} data-plan-category={category.label} className={`flex items-center gap-3 py-2 pr-3 ${category.depth ? "pl-8" : "pl-3"}`}>
                  <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
                  {fromOthers ? (
                    <span className="text-xs text-[var(--muted-foreground)]" title="This month's share of its weekly or yearly budgets">
                      +{money(fromOthers, data.baseCurrency)} other budgets
                    </span>
                  ) : null}
                  {/* The shared Input fills its box, so the box sets the width. */}
                  <div className="w-28 shrink-0">
                  <Input
                    key={`${month}-${category.id}-${line?.monthlyLimitMinor ?? 0}`}
                    aria-label={`Assign to ${category.name}`}
                    inputMode="decimal"
                    className="h-8 text-right font-mono"
                    placeholder="0.00"
                    defaultValue={line?.monthlyLimitMinor ? formatMinorToMajor(line.monthlyLimitMinor) : ""}
                    onBlur={(e) => {
                      const minor = readMinor(e.target.value);
                      if (minor == null) return setError("Enter amounts like 1500 or 1500.50");
                      if (minor !== (line?.monthlyLimitMinor ?? 0)) {
                        assign.mutate({ categoryId: category.id, budgetId: line?.monthlyBudgetId ?? null, minor });
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Amounts here are monthly budgets; a budget on a category also covers its subcategories.
          </p>
        </>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}
    </section>
  );
}
