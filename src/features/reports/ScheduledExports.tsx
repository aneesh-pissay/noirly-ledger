"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { WEEKDAYS, type ExportFormat, type ExportFrequency, type ScheduledExportBody } from "@/src/core/export-schedules";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";
const FORMAT_LABEL: Record<ExportFormat, string> = { csv: "CSV", pdf: "PDF", xlsx: "Excel (XLSX)" };

/**
 * Reports emailed on a schedule: every week or month, for the period just
 * finished, to members of the workspace. Send now to try one out.
 */
export function ScheduledExports({ workspaceId, kind, currentUserId }: { workspaceId: string; kind: "personal" | "team"; currentUserId: string }) {
  const queryClient = useQueryClient();
  const key = ["scheduled-exports", workspaceId] as const;
  const schedules = useQuery({ queryKey: key, queryFn: () => api.listScheduledExports(workspaceId) });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId), enabled: kind === "team" });
  const pools = useQuery({ queryKey: qk.budgetPools(workspaceId), queryFn: () => api.listPools(workspaceId), enabled: kind === "team" });
  const blank = (): ScheduledExportBody => ({ name: "", format: "xlsx", template: kind === "team" ? "pool" : "summary", budgetPoolId: null, frequency: "monthly", runDay: 1, recipientIds: [currentUserId] });
  const [draft, setDraft] = useState<ScheduledExportBody>(blank);

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const create = useMutation({ mutationFn: () => api.createScheduledExport(workspaceId, draft), onSuccess: async () => { setDraft(blank()); await refresh(); } });
  const change = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSettled: refresh });
  const error = create.error ?? change.error;
  const people = kind === "team" ? members.data?.members ?? [] : [];

  return (
    <section aria-label="Scheduled reports" className="surface grain space-y-4 rounded-[var(--r-lg)] p-4">
      <div>
        <h2 className="text-sm font-medium">Scheduled reports</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Emailed every week or month for the period just finished. Only members of this workspace can get them.</p>
      </div>

      {schedules.data?.schedules.length ? (
        <ul className="space-y-3">
          {schedules.data.schedules.map((s) => (
            <li key={s.id} data-schedule={s.name} className="space-y-1 border-t border-[var(--hairline)] pt-3 text-sm first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {s.name}
                  <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">{FORMAT_LABEL[s.format]}</span>
                  {s.paused ? <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">paused</span> : null}
                </p>
                <span className="flex gap-3 text-xs text-[var(--muted-foreground)]">
                  <button type="button" className="underline" disabled={change.isPending} onClick={() => change.mutate(() => api.sendScheduledExport(workspaceId, s.id))}>Send now</button>
                  <button type="button" className="underline" disabled={change.isPending} onClick={() => change.mutate(() => api.updateScheduledExport(workspaceId, s.id, { ...s, paused: !s.paused }))}>{s.paused ? "Resume" : "Pause"}</button>
                  <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={change.isPending} onClick={() => { if (window.confirm(`Stop sending ${s.name}?`)) change.mutate(() => api.deleteScheduledExport(workspaceId, s.id)); }}>Delete</button>
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {s.schedule} · to {s.recipientNames.join(", ")} · next {s.nextRunOn}
              </p>
              {s.lastRunAt ? (
                <p data-last-run className={`text-xs ${s.lastError ? "text-[var(--balance-negative)]" : "text-[var(--muted-foreground)]"}`}>
                  Last sent {new Date(s.lastRunAt).toLocaleString()} for {s.lastRange?.from} to {s.lastRange?.to}: {s.lastError ?? `to ${s.lastSentTo} ${s.lastSentTo === 1 ? "person" : "people"}`}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">Nothing scheduled.</p>
      )}

      <form
        aria-label="New scheduled report"
        className="space-y-2 border-t border-[var(--hairline)] pt-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-wrap gap-2">
          <input aria-label="Report name" required maxLength={80} placeholder="e.g. Monthly statement" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} min-w-0 flex-1`} />
          <select aria-label="File type" value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value as ExportFormat })} className={field}>
            {(Object.keys(FORMAT_LABEL) as ExportFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
          <select aria-label="What's in it" value={draft.template} onChange={(e) => setDraft({ ...draft, template: e.target.value as ScheduledExportBody["template"] })} className={field}>
            <option value="summary">Workspace summary</option>
            {kind === "team" ? <option value="pool">Budget pool</option> : null}
            {kind === "team" ? <option value="approvals">Approval audit</option> : null}
          </select>
          {draft.template === "pool" ? (
            <select aria-label="Pool" required value={draft.budgetPoolId ?? ""} onChange={(e) => setDraft({ ...draft, budgetPoolId: e.target.value || null })} className={field}>
              <option value="">Pool…</option>
              {(pools.data?.pools ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="How often" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as ExportFrequency, runDay: 1 })} className={field}>
            <option value="weekly">Every week, on</option>
            <option value="monthly">Every month, on day</option>
          </select>
          {draft.frequency === "weekly" ? (
            <select aria-label="Day of the week" value={draft.runDay} onChange={(e) => setDraft({ ...draft, runDay: Number(e.target.value) })} className={field}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          ) : (
            <select aria-label="Day of the month" value={draft.runDay} onChange={(e) => setDraft({ ...draft, runDay: Number(e.target.value) })} className={field}>
              {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          )}
        </div>
        {people.length ? (
          <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <legend className="mb-1 text-[var(--muted-foreground)]">Send to</legend>
            {people.map((m) => (
              <label key={m.userId} className="flex items-center gap-1.5">
                <input type="checkbox" aria-label={`Send to ${m.displayName}`} checked={draft.recipientIds.includes(m.userId)} onChange={() => setDraft({ ...draft, recipientIds: draft.recipientIds.includes(m.userId) ? draft.recipientIds.filter((x) => x !== m.userId) : [...draft.recipientIds, m.userId] })} />
                {m.displayName}
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">It&apos;s emailed to you.</p>
        )}
        <button type="submit" disabled={create.isPending} className="h-9 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-ink)]">Schedule it</button>
      </form>
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </section>
  );
}
