"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import type { ApprovalView, BudgetPool } from "@/src/core/sync/types";
import { Button, PageContainer } from "@noirly-dev/ui";
import { MoneyText } from "@/src/components/MoneyText";

type Props = { workspaceId: string };

export function ApprovalsInbox({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const canDecide = useCan("expense.decide");
  const [filter, setFilter] = useState<"submitted" | "all">("submitted");
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: qk.approvals(workspaceId, filter),
    queryFn: () =>
      api.listApprovals(workspaceId, filter === "all" ? undefined : "submitted"),
  });

  const decide = useMutation({
    mutationFn: (input: {
      approvalId: string;
      decision: "approved" | "rejected";
    }) => api.decideApproval(input.approvalId, { decision: input.decision }),
    onMutate: async (input) => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: qk.approvals(workspaceId) });
      const key = qk.approvals(workspaceId, filter);
      const previous = queryClient.getQueryData<{ approvals: ApprovalView[] }>(key);
      queryClient.setQueryData<{ approvals: ApprovalView[] }>(key, (old) => {
        if (!old) return old;
        if (filter === "submitted") {
          return {
            approvals: old.approvals.filter((item) => item.id !== input.approvalId),
          };
        }
        return {
          approvals: old.approvals.map((item) =>
            item.id === input.approvalId
              ? { ...item, status: input.decision }
              : item,
          ),
        };
      });
      return { previous, key };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(ctx.key, ctx.previous);
      }
      setError(err instanceof Error ? err.message : "Could not decide");
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        qk.budgetPool(result.pool.id),
        (old: { pool: BudgetPool } | undefined) =>
          old ? { pool: result.pool } : { pool: result.pool },
      );
      queryClient.setQueryData(
        qk.budgetPools(workspaceId),
        (old: { pools: BudgetPool[] } | undefined) =>
          old
            ? {
                pools: old.pools.map((pool) =>
                  pool.id === result.pool.id ? result.pool : pool,
                ),
              }
            : old,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.approvals(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: qk.budgetPools(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
    },
  });

  const approvals = query.data?.approvals ?? [];

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        {canDecide
          ? "Approve or reject submitted expenses. Spend hits the pool only on approve."
          : "You can track submitted expenses. Approvers decide."}
      </p>
      <div className="mt-4 flex gap-2">
        {(["submitted", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              filter === value
                ? "bg-[var(--surface)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {value === "submitted" ? "Pending" : "All"}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-[var(--balance-negative)]" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {approvals.map((item) => (
          <li
            key={item.id}
            className="surface grain rounded-[var(--r-lg)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--foreground)]">
                  {item.transaction.note || "Expense"}
                </p>
                <p className="mt-1 font-mono text-[11px] text-[var(--muted-foreground)]">
                  {item.submitterName} · {item.transaction.date} · {item.status}
                </p>
              </div>
              <MoneyText
                amountMinor={item.transaction.amountMinor}
                currency={item.transaction.currency}
              />
            </div>
            {canDecide && item.status === "submitted" && !item.canDecide ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Your own expense — waiting for another approver.
              </p>
            ) : null}
            {item.canDecide && item.status === "submitted" ? (
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ approvalId: item.id, decision: "approved" })
                  }
                >
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({ approvalId: item.id, decision: "rejected" })
                  }
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {approvals.length === 0 && !query.isLoading ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Nothing in this view.</p>
      ) : null}
    </PageContainer>
  );
}
