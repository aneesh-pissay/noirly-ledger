"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";

const field = "h-10 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-sm";

export function delegationsKey(workspaceId: string) {
  // Under "approvals", so a change refreshes who can decide what.
  return ["approvals", workspaceId, "delegations"] as const;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * While you're away: name someone to approve expenses for you between two
 * days. They decide what you could, on your behalf, and the history says so.
 * Lists every delegation not yet over; you end your own, owners any.
 */
export function AwayPanel({ workspaceId, currentUserId, isOwner }: { workspaceId: string; currentUserId: string; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const delegations = useQuery({ queryKey: delegationsKey(workspaceId), queryFn: () => api.listDelegations(workspaceId) });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const [toUserId, setToUserId] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [note, setNote] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["approvals", workspaceId] });
  const create = useMutation({
    mutationFn: () => api.createDelegation(workspaceId, { toUserId, startsOn, endsOn, note: note.trim() || null }),
    onSuccess: async () => {
      setToUserId("");
      setNote("");
      await refresh();
    },
  });
  const end = useMutation({ mutationFn: (id: string) => api.endDelegation(workspaceId, id), onSuccess: refresh });
  const error = create.error ?? end.error;
  const others = (members.data?.members ?? []).filter((m) => m.userId !== currentUserId);
  const list = delegations.data?.delegations ?? [];

  return (
    <section aria-label="Away" className="surface grain mt-8 space-y-4 rounded-[var(--r-lg)] p-4">
      <div>
        <h2 className="text-sm font-medium">Away</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Going away? Pick someone to approve for you on those days. They can decide whatever you could, never their own expenses, and the history notes they acted for you.
        </p>
      </div>
      {list.length ? (
        <ul className="space-y-2">
          {list.map((d) => (
            <li key={d.id} data-delegation={d.fromName} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>
                {d.fromUserId === currentUserId ? "You" : d.fromName} → {d.toUserId === currentUserId ? "you" : d.toName}
                <span className="ml-2 font-mono text-[11px] text-[var(--muted-foreground)]">
                  {d.startsOn} to {d.endsOn} · {d.state}{d.note ? ` · ${d.note}` : ""}
                </span>
              </span>
              {d.fromUserId === currentUserId || isOwner ? (
                <button type="button" className="text-xs text-[var(--muted-foreground)] underline" disabled={end.isPending} onClick={() => end.mutate(d.id)}>
                  End
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">Nobody is away.</p>
      )}
      <form
        aria-label="Set cover"
        className="flex flex-wrap items-end gap-2 border-t border-[var(--hairline)] pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <select aria-label="Who approves for you" required value={toUserId} onChange={(e) => setToUserId(e.target.value)} className={field}>
          <option value="">Who approves for you…</option>
          {others.map((m) => (
            <option key={m.userId} value={m.userId}>{m.displayName}</option>
          ))}
        </select>
        <label className="text-xs text-[var(--muted-foreground)]">
          From
          <input aria-label="First day away" type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={`${field} ml-1`} />
        </label>
        <label className="text-xs text-[var(--muted-foreground)]">
          to
          <input aria-label="Last day away" type="date" required value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={`${field} ml-1`} />
        </label>
        <input aria-label="Note" maxLength={200} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className={`${field} min-w-0 flex-1`} />
        <button type="submit" disabled={create.isPending} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]">
          Set cover
        </button>
      </form>
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </section>
  );
}
