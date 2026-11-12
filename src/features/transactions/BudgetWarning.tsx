"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { parseMajorToMinor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import type { BudgetImpact } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  baseCurrency: string;
  /** The expense as typed so far: one line, or a split's lines. Empty while there's nothing to check. */
  lines: Array<{ categoryId: string; amountMajor: string }>;
  currency: string;
  date: string;
  categoryName: (id: string) => string;
};

const RANK = { over: 0, near: 1, ok: 2 } as const;

/** Keeps the latest value once it has stopped changing for a moment, so typing doesn't ask the server on every key. */
export function useSettled<T>(value: T, delayMs = 350) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/** Says, as an expense is typed, what it would leave in its budgets, and warns before one goes over. */
export function BudgetWarning({ workspaceId, baseCurrency, lines, currency, date, categoryName }: Props) {
  const { money } = useMoneyFormat();
  const readable = lines.filter((line) => {
    try {
      return parseMajorToMinor(line.amountMajor.trim()) > 0;
    } catch {
      return false;
    }
  });
  const draft = useSettled(JSON.stringify({ lines: readable, currency, date }));
  const check = useQuery({
    queryKey: ["budget-check", workspaceId, draft],
    queryFn: () => api.checkBudgets(workspaceId, JSON.parse(draft)),
    enabled: (JSON.parse(draft) as { lines: unknown[] }).lines.length > 0,
    staleTime: 10_000,
  });
  if (!readable.length || !check.data) return null;
  const impacts = [...check.data.impacts].sort((a, b) => RANK[a.state] - RANK[b.state] || a.leftMinor - b.leftMinor);
  if (!impacts.length) return null;

  const describe = (impact: BudgetImpact) => {
    const name = `${categoryName(impact.categoryId)}'s ${impact.period} budget`;
    if (impact.state === "over") {
      return impact.alreadyOver
        ? `${categoryName(impact.categoryId)} is already over its ${impact.period} budget; this adds ${money(impact.addMinor, baseCurrency)}`
        : `This takes ${categoryName(impact.categoryId)} ${money(-impact.leftMinor, baseCurrency)} over its ${impact.period} budget`;
    }
    return `Leaves ${money(impact.leftMinor, baseCurrency)} of ${name}`;
  };

  return (
    <div role="status" aria-label="Budget check" className="space-y-1 text-xs">
      {impacts.map((impact) => (
        <p
          key={impact.budgetId}
          data-impact={impact.state}
          className={impact.state === "over" ? "text-[var(--balance-negative)]" : impact.state === "near" ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}
        >
          {impact.state === "over" ? "Over budget: " : impact.state === "near" ? "Nearly there: " : ""}
          {describe(impact)}.
        </p>
      ))}
      {check.data.missingRate ? <p className="text-[var(--muted-foreground)]">Set an FX rate for {currency} to check it against budgets.</p> : null}
    </div>
  );
}
