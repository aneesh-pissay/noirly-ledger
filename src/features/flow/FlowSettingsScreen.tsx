"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { DEFAULT_FLOW_SETTINGS, FLOW_PRIORITIES, MAX_FLOW_DAYS, type FlowLinkSettings, type FlowLinkView } from "@/src/core/flow-sync";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

/** Bills and reminders as Noirly Flow tasks: link a workspace to Flow with a Flow access token. */
export function FlowSettingsScreen({ initialWorkspaceId }: { initialWorkspaceId: string }) {
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces() });
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const status = useQuery({ queryKey: ["flow-link", workspaceId], queryFn: () => api.getFlowLink(workspaceId) });

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Noirly Flow</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">Put bills to pay, and free trials ending or dates to cancel by, on your Flow task list. Ledger makes each task a few days ahead, completes it when the bill is paid here, and cancels it if the bill goes away. Each workspace links on its own, as you.</p>
      {(workspaces.data?.workspaces.length ?? 0) > 1 ? (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-[var(--muted-foreground)]">Workspace</span>
          <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={field}>
            {workspaces.data!.workspaces.map((w) => <option key={w.id} value={w.id}>{w.kind === "personal" ? "Personal" : w.name}</option>)}
          </select>
        </label>
      ) : null}
      {status.data && !status.data.configured ? <p className="mt-6 text-sm text-[var(--muted-foreground)]">Noirly Flow isn&apos;t set up on this server yet (NOIRLY_FLOW_URL).</p> : null}
      {status.data?.configured ? <LinkForm key={`${workspaceId}:${status.data.link ? "linked" : "new"}`} workspaceId={workspaceId} flowUrl={status.data.flowUrl} link={status.data.link} /> : null}
      {status.error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{status.error.message}</p> : null}
    </PageContainer>
  );
}

function LinkForm({ workspaceId, flowUrl, link }: { workspaceId: string; flowUrl: string | null; link: FlowLinkView | null }) {
  const queryClient = useQueryClient();
  const key = ["flow-link", workspaceId];
  const [token, setToken] = useState("");
  const [flowWorkspaceId, setFlowWorkspaceId] = useState(link?.flowWorkspaceId ?? "");
  const [flowProjectId, setFlowProjectId] = useState(link?.flowProjectId ?? "");
  const [settings, setSettings] = useState<FlowLinkSettings>(link ? { bills: link.bills, reminders: link.reminders, daysAhead: link.daysAhead, priority: link.priority } : DEFAULT_FLOW_SETTINGS);
  // A linked workspace looks itself up with the saved token; a new one waits for a token.
  const [lookupToken, setLookupToken] = useState<string | null>(link ? "" : null);
  const lookup = useQuery({
    queryKey: ["flow-lookup", workspaceId, lookupToken, flowWorkspaceId],
    queryFn: () => api.lookUpFlow(workspaceId, { token: lookupToken || null, flowWorkspaceId: flowWorkspaceId || null }),
    enabled: lookupToken !== null,
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: (paused?: boolean) => api.saveFlowLink(workspaceId, { token: token.trim() || null, flowWorkspaceId, flowProjectId: flowProjectId || null, ...settings, paused }),
    onSuccess: refresh,
  });
  const sync = useMutation({ mutationFn: () => api.syncFlow(workspaceId), onSuccess: refresh });
  const unlink = useMutation({ mutationFn: () => api.deleteFlowLink(workspaceId), onSuccess: refresh });
  const error = lookup.error ?? save.error ?? sync.error ?? unlink.error;

  return (
    <div className="mt-6 space-y-6">
      {link ? (
        <section aria-label="Flow link" data-flow-link className={`surface grain rounded-[var(--r-lg)] p-4 text-sm ${link.paused ? "opacity-70" : ""}`}>
          <p className="font-medium">
            Linked to {link.flowWorkspaceName}{link.flowProjectName ? ` · ${link.flowProjectName}` : " · Inbox"}
            {link.paused ? <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">paused</span> : null}
          </p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Token ending {link.tokenHint} · {link.openTasks} open task{link.openTasks === 1 ? "" : "s"}</p>
          {link.lastSyncAt ? (
            <p data-last-sync className={`mt-1 text-xs ${link.lastOk ? "text-[var(--muted-foreground)]" : "text-[var(--balance-negative)]"}`}>Last synced {new Date(link.lastSyncAt).toLocaleString()}: {link.lastResult}</p>
          ) : <p className="mt-1 text-xs text-[var(--muted-foreground)]">Not synced yet; the daily run does it, or sync now.</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
            <button type="button" className="underline" disabled={sync.isPending || link.paused} onClick={() => sync.mutate()}>{sync.isPending ? "Syncing…" : "Sync now"}</button>
            <button type="button" className="underline" disabled={save.isPending} onClick={() => save.mutate(!link.paused)}>{link.paused ? "Resume" : "Pause"}</button>
            {flowUrl ? <a className="underline" href={flowUrl} target="_blank" rel="noreferrer">Open Flow</a> : null}
            <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={unlink.isPending} onClick={() => { if (window.confirm("Unlink Flow? Tasks already made stay in Flow.")) unlink.mutate(); }}>Unlink</button>
          </div>
        </section>
      ) : null}

      <form
        aria-label={link ? "Change Flow link" : "Link Flow"}
        className="space-y-4 surface grain rounded-[var(--r-lg)] p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined);
        }}
      >
        <label className="flex flex-col gap-1">
          <span>{link ? "New access token (leave blank to keep the saved one)" : "Flow access token"}</span>
          <span className="flex gap-2">
            <input aria-label="Flow token" type="password" autoComplete="off" placeholder="nfp_w_…" value={token} onChange={(e) => setToken(e.target.value)} className={`${field} w-full font-mono`} />
            <Button type="button" variant="ghost" disabled={!token.trim()} onClick={() => { setFlowWorkspaceId(""); setFlowProjectId(""); setLookupToken(token.trim()); }}>Check</Button>
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">Make a read and write token in Flow under Settings → API tokens. Ledger keeps it encrypted and only uses it to make and update these tasks.</span>
        </label>

        {lookup.data ? (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Flow workspace" value={flowWorkspaceId} onChange={(e) => { setFlowWorkspaceId(e.target.value); setFlowProjectId(""); }} className={field}>
              <option value="">Flow workspace…</option>
              {lookup.data.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {flowWorkspaceId ? (
              <select aria-label="Flow project" value={flowProjectId} onChange={(e) => setFlowProjectId(e.target.value)} className={field}>
                <option value="">Inbox</option>
                {lookup.data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : null}
          </div>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-xs text-[var(--muted-foreground)]">Make tasks for</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.bills} onChange={(e) => setSettings({ ...settings, bills: e.target.checked })} />Bills to pay (recurring, by hand, EMIs, card bills)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reminders} onChange={(e) => setSettings({ ...settings, reminders: e.target.checked })} />Free trials ending and dates to cancel by</label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Days ahead" value={settings.daysAhead} onChange={(e) => setSettings({ ...settings, daysAhead: Number(e.target.value) })} className={field}>
            {Array.from({ length: MAX_FLOW_DAYS }, (_, i) => <option key={i} value={i + 1}>{i + 1} day{i ? "s" : ""} ahead</option>)}
          </select>
          <select aria-label="Priority" value={settings.priority} onChange={(e) => setSettings({ ...settings, priority: e.target.value as FlowLinkSettings["priority"] })} className={field}>
            {FLOW_PRIORITIES.map((p) => <option key={p} value={p}>{p === "none" ? "No priority" : `${p[0]!.toUpperCase()}${p.slice(1)} priority`}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={save.isPending || !flowWorkspaceId}>{link ? "Save" : "Link Flow"}</Button>
      </form>
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </div>
  );
}
