"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { describeEvent } from "@/src/core/delegations";

export function historyKey(workspaceId: string, approvalId?: string) {
  return ["approvals", workspaceId, "history", approvalId ?? "all"] as const;
}

/** The approval history, newest first: the whole workspace's, or one expense's. Entries never change. */
export function ApprovalHistory({ workspaceId, approvalId }: { workspaceId: string; approvalId?: string }) {
  const history = useInfiniteQuery({
    queryKey: historyKey(workspaceId, approvalId),
    queryFn: ({ pageParam }) => api.approvalHistory(workspaceId, { approvalId, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const events = history.data?.pages.flatMap((p) => p.events) ?? [];

  if (history.isLoading) return <p className="text-xs text-[var(--muted-foreground)]">Loading history…</p>;
  if (!events.length) return <p className="text-xs text-[var(--muted-foreground)]">No history yet.</p>;
  return (
    <div>
      <ol aria-label="Approval history" className="space-y-1.5">
        {events.map((e) => (
          <li key={e.id} data-event={e.kind} className="flex flex-wrap gap-x-3 text-xs">
            <time dateTime={e.at} className="font-mono text-[var(--muted-foreground)]">
              {new Date(e.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </time>
            <span>
              {describeEvent(e)}
              {e.note && !e.kind.startsWith("delegation") ? <span className="text-[var(--muted-foreground)]"> — {e.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {history.hasNextPage ? (
        <button type="button" className="mt-2 text-xs text-[var(--muted-foreground)] underline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
          Older
        </button>
      ) : null}
    </div>
  );
}
