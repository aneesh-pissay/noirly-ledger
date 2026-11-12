"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import type { ApprovalView, BudgetPool } from "@/src/core/sync/types";
import { Button, PageContainer } from "@noirly-dev/ui";
import { MoneyText } from "@/src/components/MoneyText";
import { ApprovalHistory } from "@/src/features/approvals/ApprovalHistory";

type Props = { workspaceId: string; currentUserId: string; children?: ReactNode };

export function ApprovalsInbox({ workspaceId, currentUserId, children }: Props) {
  const queryClient = useQueryClient();
  const canDecide = useCan("expense.decide");
  const [filter, setFilter] = useState<"submitted" | "all" | "history">("submitted");
  const [error, setError] = useState<string | null>(null);
  // Expenses whose history is open; each loads only once opened.
  const [openHistory, setOpenHistory] = useState<string[]>([]);

  const query = useQuery({
    queryKey: qk.approvals(workspaceId, filter),
    queryFn: () =>
      api.listApprovals(workspaceId, filter === "all" ? undefined : "submitted"),
    enabled: filter !== "history",
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
        const item = old.approvals.find((a) => a.id === input.approvalId);
        // Approving a step before the last moves it on, not out; the refetch shows where.
        if (item && input.decision === "approved" && item.currentStep < item.steps.length - 1) {
          return { approvals: old.approvals.map((a) => (a.id === input.approvalId ? { ...a, canDecide: false } : a)) };
        }
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
      // Every approvals view, its history and who covers for whom.
      void queryClient.invalidateQueries({ queryKey: ["approvals", workspaceId] });
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
        {(["submitted", "all", "history"] as const).map((value) => (
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
            {value === "submitted" ? "Pending" : value === "all" ? "All" : "History"}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-[var(--balance-negative)]" role="alert">
          {error}
        </p>
      ) : null}
      {filter === "history" ? (
        <section aria-label="Workspace approval history" className="surface grain mt-4 rounded-[var(--r-lg)] p-4">
          <ApprovalHistory workspaceId={workspaceId} />
        </section>
      ) : null}
      <ul className={filter === "history" ? "hidden" : "mt-4 space-y-3"}>
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
                  {item.ruleName ? ` · ${item.ruleName}` : ""}
                </p>
              </div>
              <MoneyText
                amountMinor={item.transaction.amountMinor}
                currency={item.transaction.currency}
              />
            </div>
            {item.steps.length > 1 ? (
              <ol aria-label="Approval steps" className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {item.steps.map((step, i) => {
                  const label = item.stepLabels[i];
                  const current = item.status === "submitted" && i === item.currentStep;
                  return (
                    <li key={i} data-step={i + 1} className={current ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>
                      {i + 1}. {label?.label}
                      {step.decision ? ` — ${step.decision} by ${label?.decidedByName}` : current ? " — waiting" : ""}
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {item.status === "submitted" && item.waitingDays !== null ? (
              <p data-waiting={item.late ? "late" : "on-time"} className={`mt-2 text-xs ${item.late ? "text-[var(--balance-negative)]" : "text-[var(--muted-foreground)]"}`}>
                Waiting {item.waitingDays} day{item.waitingDays === 1 ? "" : "s"}
                {item.late ? " — late" : ""}
                {item.steps[item.currentStep]?.escalatedAt ? " · escalated to owners" : ""}
              </p>
            ) : null}
            {item.lateSubmission ? (
              <p data-flag="late_submission" className="mt-2 rounded-md bg-[var(--balance-negative)]/10 px-2 py-1 text-xs text-[var(--balance-negative)]">
                ⚑ Submitted {item.lateSubmission.daysLate} day{item.lateSubmission.daysLate === 1 ? "" : "s"} after the deadline ({item.lateSubmission.deadline})
              </p>
            ) : null}
            {item.violations.length ? (
              <ul aria-label="Policy flags" className="mt-3 space-y-1">
                {item.violations.map((v) => (
                  <li key={`${v.policyId}-${v.kind}`} data-flag={v.kind} className="rounded-md bg-[var(--balance-negative)]/10 px-2 py-1 text-xs text-[var(--balance-negative)]">
                    ⚑ {v.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {item.status === "submitted" && !item.canDecide && item.submittedById === currentUserId && canDecide ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Your own expense — waiting for another approver.
              </p>
            ) : null}
            {item.status === "submitted" && !item.canDecide && item.submittedById !== currentUserId && item.steps.slice(0, item.currentStep).some((s) => s.decidedById === currentUserId) ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                You approved an earlier step — the next one is someone else&apos;s.
              </p>
            ) : null}
            {item.canDecide && item.actingForName ? (
              <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                Deciding for {item.actingForName}, who is away.
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
            <details className="mt-3 text-xs" onToggle={(e) => { const open = e.currentTarget.open; setOpenHistory((ids) => (open ? [...ids, item.id] : ids.filter((id) => id !== item.id))); }}>
              <summary className="cursor-pointer text-[var(--muted-foreground)]">History</summary>
              {openHistory.includes(item.id) ? (
                <div className="mt-2">
                  <ApprovalHistory workspaceId={workspaceId} approvalId={item.id} />
                </div>
              ) : null}
            </details>
          </li>
        ))}
      </ul>
      {approvals.length === 0 && !query.isLoading && filter !== "history" ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Nothing in this view.</p>
      ) : null}
      {children}
    </PageContainer>
  );
}
