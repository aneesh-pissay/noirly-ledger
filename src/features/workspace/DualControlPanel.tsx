"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { PENDING_HOURS, type PendingStatus } from "@/src/core/dual-control";

const STATUS_LABEL: Record<PendingStatus, string> = {
  pending: "waiting",
  approved: "agreed and made",
  rejected: "turned down",
  cancelled: "taken back",
  expired: "expired",
  failed: "agreed, but couldn't be made",
};

/** Two-person approval for a shared workspace: the setting, and requests waiting for a second owner. */
export function DualControlPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const key = ["pending-actions", workspaceId];
  const state = useQuery({ queryKey: key, queryFn: () => api.listPendingActions(workspaceId) });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) }),
    ]);
  };
  const toggle = useMutation({ mutationFn: (enabled: boolean) => api.setDualControl(workspaceId, enabled), onSettled: refresh });
  const act = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSettled: refresh });
  const data = state.data;
  if (!data?.available) return null;
  const waiting = data.actions.filter((a) => a.status === "pending");
  const decided = data.actions.filter((a) => a.status !== "pending").slice(0, 8);
  // Asking to turn it off isn't a failure: it's waiting.
  const error = toggle.error ?? act.error;

  return (
    <section aria-label="Two-person approval" className="surface grain rounded-[var(--r-lg)] p-4 text-sm">
      <h2 className="font-medium">Two-person approval</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        When it&apos;s on, deleting the workspace, changing who approves (owners, approvers, custom roles) and changing approval rules take a second owner to agree. Requests wait {PENDING_HOURS} hours. Needs two owners.
      </p>
      {data.isOwner ? (
        <label className="mt-3 flex items-center gap-2">
          <input type="checkbox" checked={data.enabled} disabled={toggle.isPending || (!data.enabled && data.owners < 2)} onChange={(e) => toggle.mutate(e.target.checked)} />
          Ask a second owner to agree to sensitive changes
          {!data.enabled && data.owners < 2 ? <span className="text-xs text-[var(--muted-foreground)]">(make someone else an owner first)</span> : null}
        </label>
      ) : (
        <p className="mt-3 text-xs">{data.enabled ? "On: sensitive changes take two owners." : "Off."}</p>
      )}

      {waiting.length ? (
        <ul aria-label="Waiting for a second owner" className="mt-4 space-y-2">
          {waiting.map((a) => (
            <li key={a.id} data-pending={a.kind} className="rounded-md border border-[var(--accent)] p-3">
              <p className="font-medium">{a.summary}</p>
              <p className="text-xs text-[var(--muted-foreground)]">Asked by {a.requestedByName} · waits until {new Date(a.expiresAt).toLocaleString()}</p>
              <div className="mt-2 flex gap-2">
                {a.canDecide ? (
                  <>
                    <Button type="button" disabled={act.isPending} onClick={() => { if (window.confirm(`Agree to: ${a.summary}?`)) act.mutate(() => api.decidePendingAction(a.id, "approve")); }}>Agree</Button>
                    <Button type="button" variant="ghost" disabled={act.isPending} onClick={() => act.mutate(() => api.decidePendingAction(a.id, "reject"))}>Turn down</Button>
                  </>
                ) : null}
                {a.canCancel ? <Button type="button" variant="ghost" disabled={act.isPending} onClick={() => act.mutate(() => api.cancelPendingAction(a.id))}>Take back</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {decided.length ? (
        <ul aria-label="Decided requests" className="mt-4 space-y-1 text-xs text-[var(--muted-foreground)]">
          {decided.map((a) => (
            <li key={a.id} data-decided={a.status}>
              {new Date(a.createdAt).toLocaleDateString()} · {a.summary} — {STATUS_LABEL[a.status]}{a.decidedByName ? ` by ${a.decidedByName}` : ""}{a.result ? `: ${a.result}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role={error.message.includes("second owner") ? "status" : "alert"} className="mt-2 text-xs">{error.message}</p> : null}
    </section>
  );
}
