"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";

/** The workspace's address for emailed receipts and bills, on the receipts page. */
export function EmailInSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const key = ["inbound-email", workspaceId];
  const inbound = useQuery({ queryKey: key, queryFn: () => api.getInboundEmail(workspaceId) });
  const [copied, setCopied] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const change = useMutation({
    mutationFn: (run: () => ReturnType<typeof api.getInboundEmail>) => run(),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
  const data = inbound.data;
  if (!data?.configured) return null;
  const address = data.address;

  return (
    <section aria-label="Email them in" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
      <h2 className="font-medium">Email them in</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Forward receipts and bills from your own email address. Receipt files (PDF or images) land here to match, with the date, total and shop read from the email; a bill that says what&apos;s due and by when is added to bills to pay. Mail from anyone who isn&apos;t a member is dropped.
      </p>
      {address ? (
        <div className={`mt-3 space-y-3 ${address.enabled ? "" : "opacity-70"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Forwarding address" readOnly value={address.email} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 font-mono text-xs" />
            <Button type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(address.email).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy"}</Button>
            {address.enabled ? null : <span className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">off</span>}
          </div>
          {data.canManage ? (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={address.makeBills} disabled={change.isPending} onChange={(e) => change.mutate(() => api.setInboundEmail(workspaceId, { enabled: address.enabled, makeBills: e.target.checked }))} />
                Add bills from emails
              </label>
              <button type="button" className="underline text-[var(--muted-foreground)]" disabled={change.isPending} onClick={() => change.mutate(() => api.setInboundEmail(workspaceId, { enabled: !address.enabled, makeBills: address.makeBills }))}>{address.enabled ? "Turn off" : "Turn on"}</button>
              <button type="button" className="underline text-[var(--muted-foreground)]" disabled={change.isPending} onClick={() => { if (window.confirm("Make a new address? Mail to the current one will be dropped.")) change.mutate(() => api.rotateInboundEmail(workspaceId)); }}>New address</button>
              <button type="button" className="underline text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]" disabled={change.isPending} onClick={() => { if (window.confirm("Remove the address? Mail to it will be dropped.")) change.mutate(() => api.deleteInboundEmail(workspaceId)); }}>Remove</button>
            </div>
          ) : null}
        </div>
      ) : data.canManage ? (
        <Button type="button" className="mt-3" disabled={change.isPending} onClick={() => change.mutate(() => api.rotateInboundEmail(workspaceId))}>Get an email address</Button>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">A workspace manager can set up an address.</p>
      )}

      {data.recent.length ? (
        <div className="mt-3">
          <button type="button" className="text-xs underline text-[var(--muted-foreground)]" onClick={() => setShowLog(!showLog)}>Recent emails ({data.recent.length})</button>
          {showLog ? (
            <ul aria-label="Recent emails" className="mt-2 space-y-1 text-xs">
              {data.recent.map((e) => (
                <li key={e.id} data-email={e.status} className={e.status === "rejected" ? "text-[var(--balance-negative)]" : ""}>
                  {new Date(e.receivedAt).toLocaleString()} · {e.from ?? "unknown sender"} · {e.subject ?? "(no subject)"} —{" "}
                  {e.status === "accepted" ? [e.receipts ? `${e.receipts} receipt${e.receipts === 1 ? "" : "s"}` : null, e.billMade ? "bill added" : null].filter(Boolean).join(", ") || "taken" : `dropped: ${e.reason}`}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {change.error ? <p role="alert" className="mt-2 text-[var(--balance-negative)]">{change.error.message}</p> : null}
    </section>
  );
}
