"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { RETENTION_CHOICES, RETENTION_LABEL, type RetentionPolicy } from "@/src/core/retention";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

const HINT: Record<keyof RetentionPolicy, string> = {
  deletedTransactionsDays: "Transactions already deleted, counted from when they were deleted. Their receipt files, comments and change history go with them.",
  unmatchedReceiptsDays: "Receipts uploaded or emailed in but never matched to a transaction, with their files.",
  notificationsDays: "Notifications about this workspace, for everyone in it.",
};

/** How long the workspace keeps what it no longer uses, and deleting it outright. */
export function RetentionSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const key = ["retention", workspaceId];
  const current = useQuery({ queryKey: key, queryFn: () => api.getRetention(workspaceId), retry: false });
  const [draft, setDraft] = useState<RetentionPolicy | null>(null);
  const [typed, setTyped] = useState("");
  const policy = draft ?? current.data?.policy ?? null;
  const save = useMutation({
    mutationFn: () => api.setRetention(workspaceId, policy!),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setDraft(null);
    },
  });
  const run = useMutation({ mutationFn: () => api.applyRetention(workspaceId) });
  const remove = useMutation({
    mutationFn: () => api.deleteWorkspace(workspaceId, typed),
    onSuccess: () => router.push("/home"),
  });
  if (!current.data || !policy) return null;
  const error = save.error ?? run.error ?? remove.error;

  return (
    <>
      <section aria-label="Retention" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
        <h2 className="font-medium">Keeping and deleting</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          What the workspace no longer uses can go after a while, automatically each day. Each is kept for good until you choose otherwise. The audit history is never shortened; it records each clear-out instead.
        </p>
        <div className="mt-3 space-y-3">
          {(Object.keys(RETENTION_LABEL) as Array<keyof RetentionPolicy>).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="w-48">{RETENTION_LABEL[k]}</span>
                <select aria-label={RETENTION_LABEL[k]} value={policy[k] ?? ""} onChange={(e) => setDraft({ ...policy, [k]: e.target.value ? Number(e.target.value) : null })} className={field}>
                  <option value="">Keep for good</option>
                  {RETENTION_CHOICES.map((d) => <option key={d} value={d}>Delete after {d} days</option>)}
                </select>
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">{HINT[k]}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" disabled={!draft || save.isPending} onClick={() => save.mutate()}>Save</Button>
          <Button type="button" variant="ghost" disabled={run.isPending || Boolean(draft)} onClick={() => run.mutate()}>{run.isPending ? "Clearing…" : "Clear out now"}</Button>
          {run.data ? (
            <span role="status" className="text-xs text-[var(--muted-foreground)]">
              Removed {run.data.removed.deletedTransactions} deleted transactions, {run.data.removed.unmatchedReceipts} receipts and {run.data.removed.notifications} notifications.
            </span>
          ) : current.data.lastRunAt ? <span className="text-xs text-[var(--muted-foreground)]">Last cleared {new Date(current.data.lastRunAt).toLocaleString()}.</span> : null}
        </div>
      </section>

      {current.data.kind === "team" ? (
        <section aria-label="Delete workspace" className="mt-6 rounded-[var(--r-lg)] border border-[var(--balance-negative)] p-4 text-sm">
          <h2 className="font-medium text-[var(--balance-negative)]">Delete this workspace</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Deletes {current.data.name} and everything in it for good: transactions, receipts, budgets, history, backups and the audit history. Everyone in it is told. Download an export first if you may want it. Only an owner can do this.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input aria-label="Type the workspace's name" placeholder={current.data.name} value={typed} onChange={(e) => setTyped(e.target.value)} className={`${field} w-64`} />
            <Button type="button" variant="ghost" className="text-[var(--balance-negative)]" disabled={typed.trim() !== current.data.name.trim() || remove.isPending} onClick={() => remove.mutate()}>
              {remove.isPending ? "Deleting…" : "Delete workspace"}
            </Button>
          </div>
        </section>
      ) : (
        <p className="mt-6 text-xs text-[var(--muted-foreground)]">Your personal workspace is deleted with your Noirly account, from Noirly Identity.</p>
      )}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </>
  );
}
