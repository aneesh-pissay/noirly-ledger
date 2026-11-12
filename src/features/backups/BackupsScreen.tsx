"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { BACKUP_FREQUENCIES, KEEP_BACKUPS, type BackupFrequency } from "@/src/core/backup";
import { RetentionSection } from "@/src/features/backups/RetentionSection";
import { RestoredNote, RestoreSection } from "@/src/features/backups/RestoreSection";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

function size(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Download everything in a workspace as JSON, and keep backups of it on a schedule. */
export function BackupsScreen({ initialWorkspaceId }: { initialWorkspaceId: string }) {
  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces() });
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const key = ["backups", workspaceId];
  const settings = useQuery({ queryKey: key, queryFn: () => api.getBackups(workspaceId), retry: false });
  const schedule = useMutation({
    mutationFn: (body: { enabled: boolean; frequency: BackupFrequency }) => api.setBackupSchedule(workspaceId, body),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
  const now = useMutation({ mutationFn: () => api.backUpNow(workspaceId), onSuccess: () => queryClient.invalidateQueries({ queryKey: key }) });
  const [confirming, setConfirming] = useState<string | null>(null);
  const restore = useMutation({
    mutationFn: (backupId: string) => api.restoreBackup(workspaceId, backupId),
    onSuccess: () => { setConfirming(null); void queryClient.invalidateQueries({ queryKey: ["workspaces"] }); },
  });
  const data = settings.data;
  const error = schedule.error ?? now.error ?? restore.error;

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Export, backups and retention</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Everything in a workspace as one JSON file: accounts, transactions (notes included), budgets, goals, bills, approvals, rules, members and the audit history. Secrets and receipt files themselves aren&apos;t in it. Only those who run the workspace can export it or keep backups.
      </p>
      {(workspaces.data?.workspaces.length ?? 0) > 1 ? (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-[var(--muted-foreground)]">Workspace</span>
          <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={field}>
            {workspaces.data!.workspaces.map((w) => <option key={w.id} value={w.id}>{w.kind === "personal" ? "Personal" : w.name}</option>)}
          </select>
        </label>
      ) : null}

      {settings.error ? <p className="mt-6 text-sm text-[var(--muted-foreground)]">{settings.error.message}</p> : null}
      {data ? (
        <>
          <section aria-label="Export" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
            <h2 className="font-medium">Export now</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Downloads the whole workspace as JSON. It&apos;s recorded in the audit history.</p>
            <a href={`/api/workspaces/${workspaceId}/export?format=json`} className="mt-3 inline-flex h-9 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-ink)]">Download JSON</a>
          </section>

          <section aria-label="Backups" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
            <h2 className="font-medium">Backups</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              The same export, kept for you: encrypted, compressed, and the last {KEEP_BACKUPS} kept. Downloads come as .json.gz.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={data.enabled} disabled={schedule.isPending} onChange={(e) => schedule.mutate({ enabled: e.target.checked, frequency: data.frequency })} />
                Back up automatically
              </label>
              <select aria-label="How often" value={data.frequency} disabled={schedule.isPending} onChange={(e) => schedule.mutate({ enabled: data.enabled, frequency: e.target.value as BackupFrequency })} className={field}>
                {BACKUP_FREQUENCIES.map((f) => <option key={f} value={f}>{f === "daily" ? "Every day" : "Every week"}</option>)}
              </select>
              <Button type="button" variant="ghost" disabled={now.isPending} onClick={() => now.mutate()}>{now.isPending ? "Backing up…" : "Back up now"}</Button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">{data.lastRunAt ? `Last backup ${new Date(data.lastRunAt).toLocaleString()}.` : "No backups yet."}</p>
            <ul aria-label="Backups kept" className="mt-3 divide-y divide-[var(--hairline)]">
              {data.backups.map((b) => (
                <li key={b.id} data-backup={b.trigger} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {new Date(b.createdAt).toLocaleString()}
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">{b.trigger === "manual" ? "made by hand" : "scheduled"} · {b.transactionCount} transactions · {size(b.sizeBytes)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <a className="text-xs underline" href={`/api/workspaces/${workspaceId}/backups/${b.id}`}>Download</a>
                    {confirming === b.id ? (
                      <>
                        <span className="text-xs text-[var(--muted-foreground)]">As a new workspace?</span>
                        <button type="button" className="text-xs underline" disabled={restore.isPending} onClick={() => restore.mutate(b.id)}>{restore.isPending ? "Restoring…" : "Yes, restore"}</button>
                        <button type="button" className="text-xs text-[var(--muted-foreground)]" onClick={() => setConfirming(null)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" className="text-xs underline" onClick={() => { restore.reset(); setConfirming(b.id); }}>Restore</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">Restoring makes a new workspace from the backup; this one stays as it is.</p>
            {restore.data ? <RestoredNote result={restore.data.restored} /> : null}
          </section>
          <RetentionSection key={workspaceId} workspaceId={workspaceId} />
        </>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
      <RestoreSection />
    </PageContainer>
  );
}
