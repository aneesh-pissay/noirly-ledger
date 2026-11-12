"use client";

import { PageContainer } from "@noirly-dev/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { BudgetPoolRealtime } from "@/src/features/realtime/BudgetPoolRealtime";
import { PoolMeter } from "@/src/features/pools/PoolMeter";
import { MoneyText } from "@/src/components/MoneyText";
import { PoolRulesPanel } from "@/src/features/pools/PoolRulesPanel";
import { PoolContributions } from "@/src/features/pools/PoolContributions";

type Props = {
  workspaceId: string;
  poolId: string;
  currentUserId: string;
  baseCurrency: string;
};

export function PoolDetail({ workspaceId, poolId, currentUserId, baseCurrency }: Props) {
  const poolQuery = useQuery({
    queryKey: qk.budgetPool(poolId),
    queryFn: () => api.getPool(poolId),
  });
  const expensesQuery = useQuery({
    queryKey: qk.transactions(workspaceId, { budgetPoolId: poolId }),
    queryFn: () => api.listExpenses(workspaceId, poolId),
  });

  const pool = poolQuery.data?.pool;
  const items = expensesQuery.data?.items ?? [];

  return (
    <PageContainer size="md">
      <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--accent)]">POOL</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {pool?.name ?? "Budget pool"}
          </h1>
          {pool?.description ? (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{pool.description}</p>
          ) : null}
        </div>
        <BudgetPoolRealtime workspaceId={workspaceId} poolId={poolId} />
      </div>

      {pool ? (
        <div className="mt-6 surface grain rounded-[var(--r-lg)] p-4">
          <PoolMeter pool={pool} />
        </div>
      ) : null}
      {/* Keyed by the rules, so its form starts from what's saved (and live spend updates don't reset it). */}
      {pool ? <PoolContributions workspaceId={workspaceId} poolId={poolId} currentUserId={currentUserId} baseCurrency={baseCurrency} /> : null}
      {pool ? <PoolRulesPanel key={JSON.stringify(pool.rules)} workspaceId={workspaceId} pool={pool} currentUserId={currentUserId} baseCurrency={baseCurrency} /> : null}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium">Expenses</h2>
        <Link
          href={`/w/${workspaceId}/expenses/new?poolId=${poolId}`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Submit expense
        </Link>
      </div>
      <ul className="mt-3 divide-y divide-[var(--hairline)] overflow-hidden surface grain rounded-[var(--r-lg)]">
        {items.map((txn) => (
          <li key={txn.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm text-[var(--foreground)]">{txn.note || "Expense"}</p>
              <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                {txn.date} · {txn.isPosted ? "posted" : "pending"}
              </p>
            </div>
            <MoneyText amountMinor={txn.amountMinor} currency={txn.currency} />
          </li>
        ))}
      </ul>
      {items.length === 0 && !expensesQuery.isLoading ? (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">No expenses against this pool yet.</p>
      ) : null}
    </PageContainer>
  );
}
