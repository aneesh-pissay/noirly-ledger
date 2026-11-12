"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { WEEKDAYS } from "@/src/core/export-schedules";
import {
  allowedFrequencies,
  AUTOMATION_KINDS,
  AUTOMATION_LABEL,
  DEFAULT_PARAMS,
  type AutomationBody,
  type AutomationKind,
  type AutomationView,
} from "@/src/core/automations";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

const KIND_HINT: Record<AutomationKind, string> = {
  digest: "A summary of the week or month just finished: income, spending, the biggest categories, budgets gone over and anything unusual.",
  budget_refresh: "Sets monthly budgets to the average of what was actually spent over the last few months, plus or minus a percent.",
  sweep: "Puts a share of last month's unspent budget money into a savings goal.",
};

const blank = (kind: AutomationKind): AutomationBody => ({ name: "", kind, frequency: allowedFrequencies(kind).at(-1)!, runDay: 1, params: { ...DEFAULT_PARAMS } });

/**
 * Automations: things Ledger does on a schedule. Each shows when it runs
 * next and how its last run went, and can be run now.
 */
export function AutomationsScreen({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const key = ["automations", workspaceId] as const;
  const automations = useQuery({ queryKey: key, queryFn: () => api.listAutomations(workspaceId) });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const budgets = useQuery({ queryKey: qk.budgets(workspaceId), queryFn: () => api.listBudgets(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const goals = useQuery({ queryKey: qk.savingsGoals(workspaceId), queryFn: () => api.listGoals(workspaceId) });
  const [draft, setDraft] = useState<AutomationBody>(() => blank("digest"));
  const [editingId, setEditingId] = useState<string | null>(null);

  // A run can change budgets and goals.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) }),
      queryClient.invalidateQueries({ queryKey: qk.savingsGoals(workspaceId) }),
    ]);
  const reset = () => {
    setDraft(blank("digest"));
    setEditingId(null);
  };
  const save = useMutation({
    mutationFn: () => (editingId ? api.updateAutomation(workspaceId, editingId, draft) : api.createAutomation(workspaceId, draft)),
    onSuccess: async () => {
      reset();
      await refresh();
    },
  });
  const change = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: refresh });
  const error = save.error ?? change.error;

  const people = members.data?.members ?? [];
  const categoryName = (id: string) => categories.data?.categories.find((c) => c.id === id)?.name ?? "a category";
  const monthlyBudgets = (budgets.data?.budgets ?? []).filter((b) => b.period === "monthly");
  const openGoals = (goals.data?.goals ?? []).filter((g) => !g.completedAt);
  const p = draft.params;
  const setParams = (next: Partial<AutomationBody["params"]>) => setDraft({ ...draft, params: { ...p, ...next } });

  const describe = (a: AutomationView) => {
    if (a.kind === "digest") return `To ${a.params.recipientIds.map((id) => people.find((m) => m.userId === id)?.displayName ?? "someone").join(", ")}${a.params.email ? ", by email too" : ""}`;
    if (a.kind === "budget_refresh") {
      const which = a.params.categoryIds.length ? a.params.categoryIds.map(categoryName).join(", ") : "every monthly budget";
      return `${which}: average of ${a.params.months} month${a.params.months === 1 ? "" : "s"}${a.params.adjustPct ? `, ${a.params.adjustPct > 0 ? "+" : ""}${a.params.adjustPct}%` : ""}`;
    }
    return `${a.params.sweepPct}% of what's unspent into ${goals.data?.goals.find((g) => g.id === a.params.goalId)?.name ?? "a goal"}`;
  };
  const edit = (a: AutomationView) => {
    setEditingId(a.id);
    setDraft({ name: a.name, kind: a.kind, frequency: a.frequency, runDay: a.runDay, params: a.params });
  };
  const bodyOf = (a: AutomationView): AutomationBody => ({ name: a.name, kind: a.kind, frequency: a.frequency, runDay: a.runDay, params: a.params });

  const list = automations.data?.automations ?? [];

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">Things Ledger does for you on a schedule: send a digest, keep budgets in line with what you really spend, or sweep what&apos;s left over into a goal. Budget changes show in each budget&apos;s history.</p>

      <section aria-label="Automations" className="mt-6 space-y-3">
        {list.length ? list.map((a) => (
          <article key={a.id} data-automation={a.name} className={`surface grain rounded-[var(--r-lg)] p-4 text-sm ${a.paused ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{a.name}{a.paused ? <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">paused</span> : null}</p>
              {canManage ? (
                <span className="flex gap-3 text-xs text-[var(--muted-foreground)]">
                  <button type="button" className="underline" disabled={change.isPending} onClick={() => change.mutate(() => api.runAutomation(workspaceId, a.id))}>Run now</button>
                  <button type="button" className="underline" disabled={change.isPending} onClick={() => change.mutate(() => api.updateAutomation(workspaceId, a.id, { ...bodyOf(a), paused: !a.paused }))}>{a.paused ? "Resume" : "Pause"}</button>
                  <button type="button" className="underline" onClick={() => edit(a)}>Edit</button>
                  <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={change.isPending} onClick={() => { if (window.confirm(`Delete ${a.name}?`)) change.mutate(() => api.deleteAutomation(workspaceId, a.id)); }}>Delete</button>
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{AUTOMATION_LABEL[a.kind]} · {a.schedule}{a.paused ? "" : ` · next ${a.nextRunOn}`}</p>
            <p className="text-xs">{describe(a)}</p>
            {a.lastRunAt ? (
              <p data-last-run className={`mt-1 text-xs ${a.lastOk ? "text-[var(--muted-foreground)]" : "text-[var(--balance-negative)]"}`}>
                Last ran {new Date(a.lastRunAt).toLocaleString()}: {a.lastResult}
              </p>
            ) : null}
          </article>
        )) : <p className="text-sm text-[var(--muted-foreground)]">No automations yet.</p>}
      </section>

      {canManage ? (
        <form
          aria-label={editingId ? "Edit automation" : "New automation"}
          className="mt-6 space-y-4 surface grain rounded-[var(--r-lg)] p-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input aria-label="Automation name" required maxLength={80} placeholder="e.g. Monthly digest" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} w-full`} />
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--muted-foreground)]">What it does</span>
            <select aria-label="Kind" value={draft.kind} disabled={Boolean(editingId)} onChange={(e) => { const kind = e.target.value as AutomationKind; setDraft({ ...blank(kind), name: draft.name }); }} className={field}>
              {AUTOMATION_KINDS.map((k) => <option key={k} value={k}>{AUTOMATION_LABEL[k]}</option>)}
            </select>
            <span className="text-xs text-[var(--muted-foreground)]">{KIND_HINT[draft.kind]}</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Runs</span>
            <select aria-label="How often" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as AutomationBody["frequency"], runDay: 1 })} className={field}>
              {allowedFrequencies(draft.kind).map((f) => <option key={f} value={f}>{f === "weekly" ? "Every week" : "Every month"}</option>)}
            </select>
            <select aria-label="Day" value={draft.runDay} onChange={(e) => setDraft({ ...draft, runDay: Number(e.target.value) })} className={field}>
              {draft.frequency === "weekly"
                ? WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>on {d}</option>)
                : Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>on day {i + 1}</option>)}
            </select>
          </div>

          {draft.kind === "digest" ? (
            <fieldset className="space-y-2">
              <legend className="text-xs text-[var(--muted-foreground)]">Who gets it</legend>
              <div className="flex flex-wrap gap-x-3 text-xs">
                {people.map((m) => (
                  <label key={m.userId} className="flex items-center gap-1">
                    <input type="checkbox" checked={p.recipientIds.includes(m.userId)} onChange={() => setParams({ recipientIds: p.recipientIds.includes(m.userId) ? p.recipientIds.filter((x) => x !== m.userId) : [...p.recipientIds, m.userId] })} />
                    {m.displayName}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={p.email} onChange={(e) => setParams({ email: e.target.checked })} />
                Email it too
              </label>
            </fieldset>
          ) : null}

          {draft.kind === "budget_refresh" ? (
            <fieldset className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-2">
                  Average of the last
                  <input aria-label="Months" type="number" min={1} max={12} value={p.months} onChange={(e) => setParams({ months: Number(e.target.value) })} className={`${field} w-16`} />
                  months,
                </label>
                <label className="flex items-center gap-2">
                  adjusted by
                  <input aria-label="Adjust percent" type="number" min={-50} max={100} value={p.adjustPct} onChange={(e) => setParams({ adjustPct: Number(e.target.value) })} className={`${field} w-20`} />
                  %
                </label>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Which budgets (none picked: every monthly budget)</p>
              <div className="flex flex-wrap gap-x-3 text-xs">
                {monthlyBudgets.length ? monthlyBudgets.map((b) => (
                  <label key={b.id} className="flex items-center gap-1">
                    <input type="checkbox" checked={p.categoryIds.includes(b.categoryId)} onChange={() => setParams({ categoryIds: p.categoryIds.includes(b.categoryId) ? p.categoryIds.filter((x) => x !== b.categoryId) : [...p.categoryIds, b.categoryId] })} />
                    {categoryName(b.categoryId)}
                  </label>
                )) : <span className="text-[var(--muted-foreground)]">No monthly budgets yet.</span>}
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">Months with no spending count as zero; a budget with nothing spent at all is left as it is.</p>
            </fieldset>
          ) : null}

          {draft.kind === "sweep" ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-2">
                Sweep
                <input aria-label="Sweep percent" type="number" min={1} max={100} value={p.sweepPct} onChange={(e) => setParams({ sweepPct: Number(e.target.value) })} className={`${field} w-20`} />
                % of last month&apos;s unspent monthly budgets into
              </label>
              <select aria-label="Goal" value={p.goalId ?? ""} onChange={(e) => setParams({ goalId: e.target.value || null })} className={field}>
                <option value="">Pick a goal…</option>
                {openGoals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>{editingId ? "Save automation" : "Add automation"}</Button>
            {editingId ? <Button type="button" variant="ghost" onClick={reset}>Cancel</Button> : null}
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </PageContainer>
  );
}
