"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { actionLabel, AUDIT_ENTITIES, AUDIT_ENTITY_LABEL, canonicalJson } from "@/src/core/audit";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

/**
 * The audit history: every change to the workspace's money, who made it
 * and when, newest first. It can't be edited; "Check" walks the whole chain
 * to show nothing was changed behind the app's back.
 */
export function AuditScreen({ workspaceId }: { workspaceId: string }) {
  const [entity, setEntity] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const filters = Object.fromEntries(Object.entries({ entity, actorId, from, to }).filter(([, v]) => v));
  const history = useInfiniteQuery({
    queryKey: ["audit", workspaceId, filters],
    queryFn: ({ pageParam }) => api.listAudit(workspaceId, { ...filters, ...(pageParam ? { before: String(pageParam) } : {}) }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const verify = useMutation({ mutationFn: () => api.verifyAudit(workspaceId) });
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];
  const actors = history.data?.pages[0]?.actors ?? [];
  const exportUrl = `/api/workspaces/${workspaceId}/audit/export?${new URLSearchParams(filters)}`;

  return (
    <PageContainer size="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit history</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Every change to this workspace&apos;s money: transactions, budgets, approvals, bills paid, goal and pool contributions, and members. Entries are never changed or removed, and each is sealed with the one before it, so any tampering shows when you check.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={verify.isPending} onClick={() => verify.mutate()}>{verify.isPending ? "Checking…" : "Check integrity"}</Button>
          <a href={exportUrl} className="inline-flex h-9 items-center rounded-md border border-[var(--hairline)] px-3 text-sm">Export CSV</a>
        </div>
      </div>

      {verify.data ? (
        <p role="status" data-verify={verify.data.ok ? "ok" : "broken"} className={`mt-4 rounded-md border p-3 text-sm ${verify.data.ok ? "border-[var(--hairline)]" : "border-[var(--balance-negative)] text-[var(--balance-negative)]"}`}>
          {verify.data.ok
            ? `All ${verify.data.entries} entries check out: none changed, removed or added out of order.`
            : `The chain is broken at entry ${verify.data.brokenAt}: ${verify.data.reason}. The ${verify.data.entries} entries before it check out.`}
        </p>
      ) : null}
      {verify.error ? <p role="alert" className="mt-4 text-sm text-[var(--balance-negative)]">{verify.error.message}</p> : null}

      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="What" value={entity} onChange={(e) => setEntity(e.target.value)} className={field}>
          <option value="">Everything</option>
          {AUDIT_ENTITIES.map((e) => <option key={e} value={e}>{AUDIT_ENTITY_LABEL[e]}</option>)}
        </select>
        <select aria-label="Who" value={actorId} onChange={(e) => setActorId(e.target.value)} className={field}>
          <option value="">Anyone</option>
          {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        <input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
      </div>

      {history.error ? <p role="alert" className="mt-4 text-sm text-[var(--balance-negative)]">{history.error.message}</p> : null}
      <ol aria-label="Audit entries" className="mt-4 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)] text-sm">
        {entries.map((e) => (
          <li key={e.seq} data-audit={e.action} className="px-4 py-2">
            <button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOpen(open === e.seq ? null : e.seq)}>
              <span>
                <span className="font-mono text-xs text-[var(--muted-foreground)]">#{e.seq}</span> {e.summary}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">{e.actorName ?? "Ledger"} · {new Date(e.at).toLocaleString()}</span>
            </button>
            {open === e.seq ? (
              <dl className="mt-2 grid gap-1 text-xs text-[var(--muted-foreground)] sm:grid-cols-[8rem_1fr]">
                <dt>Action</dt><dd className="font-mono">{e.action} ({actionLabel(e.action)})</dd>
                {e.entityId ? <><dt>Record</dt><dd className="font-mono">{e.entity} {e.entityId}</dd></> : null}
                <dt>Details</dt><dd className="break-all font-mono">{canonicalJson(e.data)}</dd>
                <dt>Seal</dt><dd className="break-all font-mono">{e.hash}</dd>
              </dl>
            ) : null}
          </li>
        ))}
        {!entries.length && !history.isPending ? <li className="px-4 py-3 text-[var(--muted-foreground)]">Nothing recorded yet{Object.keys(filters).length ? " that matches" : ""}.</li> : null}
      </ol>
      {history.hasNextPage ? (
        <Button type="button" variant="ghost" className="mt-3" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? "Loading…" : "Older entries"}</Button>
      ) : null}
    </PageContainer>
  );
}
