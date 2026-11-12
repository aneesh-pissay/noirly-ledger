"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageContainer } from "@noirly-dev/ui";
import { api, type DepartmentBody } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { ProgressBar } from "@/src/components/ProgressBar";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { formatMinorToMajor } from "@/src/core/money";
import { budgetState, GROUP_PERIOD_LABEL, GROUP_PERIODS, type DepartmentView, type GroupPeriod } from "@/src/core/group-budgets";
import type { Project } from "@/src/core/sync/types";

const field = "h-10 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-sm";

export function departmentsKey(workspaceId: string) {
  // Under "transactions", so new spending refreshes where budgets stand.
  return ["transactions", workspaceId, "departments"] as const;
}

const blank = (): DepartmentBody => ({ name: "", parentId: null, budgetMajor: null, period: "monthly", alertPct: 80, memberIds: [] });

function tone(state: string) {
  return state === "over" ? ("negative" as const) : state === "near" ? ("accent" as const) : ("positive" as const);
}

/**
 * Departments, the teams inside them, and projects, each with a budget and
 * where it stands. Expenses go to the submitter's team (or department) by
 * default. Approvers and owners set them up.
 */
export function DepartmentsScreen({ workspaceId, baseCurrency, canManage }: { workspaceId: string; baseCurrency: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { money: format } = useMoneyFormat();
  const money = (minor: number) => format(minor, baseCurrency);
  const departments = useQuery({ queryKey: departmentsKey(workspaceId), queryFn: () => api.listDepartments(workspaceId) });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId) });
  const [draft, setDraft] = useState<DepartmentBody>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectBudgets, setProjectBudgets] = useState<Record<string, string>>({});

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: departmentsKey(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: qk.projects(workspaceId) }),
  ]);
  const reset = () => {
    setDraft(blank());
    setEditingId(null);
  };
  const save = useMutation({
    mutationFn: () => (editingId ? api.updateDepartment(workspaceId, editingId, draft) : api.createDepartment(workspaceId, draft)),
    onSuccess: async () => {
      reset();
      await refresh();
    },
  });
  const change = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: refresh });
  const addProject = useMutation({
    mutationFn: () => api.createProject(workspaceId, { name: projectName.trim() }),
    onSuccess: async () => {
      setProjectName("");
      await refresh();
    },
  });
  const error = save.error ?? change.error ?? addProject.error;

  const list = departments.data?.departments ?? [];
  const people = members.data?.members ?? [];
  const tops = list.filter((d) => !d.parentId);
  const teamsOf = (id: string) => list.filter((d) => d.parentId === id);
  const nameOf = (id: string) => people.find((m) => m.userId === id)?.displayName ?? "Unknown";
  const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const edit = (d: DepartmentView) => {
    setEditingId(d.id);
    setDraft({ name: d.name, parentId: d.parentId, budgetMajor: d.budgetMinor === null ? null : formatMinorToMajor(d.budgetMinor), period: d.period, alertPct: d.alertPct, memberIds: d.memberIds });
  };

  const row = (d: DepartmentView, team = false) => (
    <li key={d.id} data-department={d.name} className={`space-y-2 py-3 ${team ? "ml-6 border-l border-[var(--hairline)] pl-4" : ""} ${d.archived ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {d.name}
          {team ? <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">team</span> : null}
          {d.archived ? <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">archived</span> : null}
        </p>
        <p className="font-mono text-sm tabular-nums">
          {money(d.spentMinor)}
          {d.budgetMinor !== null ? <span className="text-[var(--muted-foreground)]"> of {money(d.budgetMinor)} {GROUP_PERIOD_LABEL[d.period]}</span> : null}
        </p>
      </div>
      {d.budgetMinor !== null ? (
        <>
          <ProgressBar value={d.spentMinor / d.budgetMinor} tone={tone(d.state)} />
          <p className="text-xs text-[var(--muted-foreground)]">
            {d.state === "over" ? `Over by ${money(-(d.remainingMinor ?? 0))}` : `${money(d.remainingMinor ?? 0)} left`} · {d.from} to {d.to}
            {!team && teamsOf(d.id).length ? " · teams included" : ""}
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">No budget · {d.from} to {d.to}</p>
      )}
      <p className="text-xs text-[var(--muted-foreground)]">{d.memberIds.length ? d.memberIds.map(nameOf).join(", ") : "No members"}</p>
      {canManage ? (
        <span className="flex gap-3 text-xs text-[var(--muted-foreground)]">
          <button type="button" className="underline" onClick={() => edit(d)}>Edit</button>
          <button type="button" className="underline" disabled={change.isPending} onClick={() => change.mutate(() => api.updateDepartment(workspaceId, d.id, { archived: !d.archived }))}>
            {d.archived ? "Reopen" : "Archive"}
          </button>
          <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={change.isPending} onClick={() => change.mutate(() => api.deleteDepartment(workspaceId, d.id))}>Delete</button>
        </span>
      ) : null}
    </li>
  );

  const projectList = (projects.data?.projects ?? []).filter((p) => !p.archived);
  const projectRow = (p: Project) => {
    const s = budgetState(p.spentMinor, p.budgetMinor, p.alertPct);
    return (
      <li key={p.id} data-project={p.name} className="space-y-2 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
            {p.name}
          </p>
          <p className="font-mono text-sm tabular-nums">
            {money(p.spentMinor)}
            {p.budgetMinor !== null ? <span className="text-[var(--muted-foreground)]"> of {money(p.budgetMinor)}</span> : null}
          </p>
        </div>
        {p.budgetMinor !== null ? (
          <>
            <ProgressBar value={p.spentMinor / p.budgetMinor} tone={tone(s.state)} />
            <p className="text-xs text-[var(--muted-foreground)]">{s.state === "over" ? `Over by ${money(-(s.remainingMinor ?? 0))}` : `${money(s.remainingMinor ?? 0)} left`} · whole project</p>
          </>
        ) : null}
        {canManage ? (
          <form
            aria-label={`Budget for ${p.name}`}
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const value = (projectBudgets[p.id] ?? "").trim();
              change.mutate(() => api.updateProject(p.id, { budgetMajor: value || null }));
            }}
          >
            <input aria-label="Project budget" inputMode="decimal" placeholder={p.budgetMinor !== null ? formatMinorToMajor(p.budgetMinor) : `Budget (${baseCurrency})`} value={projectBudgets[p.id] ?? ""} onChange={(e) => setProjectBudgets({ ...projectBudgets, [p.id]: e.target.value })} className={`${field} h-9 w-40 text-xs`} />
            <button type="submit" className="text-xs text-[var(--muted-foreground)] underline">Set budget</button>
          </form>
        ) : null}
      </li>
    );
  };

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Departments</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Budgets for departments, their teams and projects. A department&apos;s spending includes its teams&apos;. Expenses go to the submitter&apos;s team or department unless they pick another.
      </p>

      <section aria-label="Departments and teams" className="surface grain mt-6 rounded-[var(--r-lg)] px-4">
        {tops.length ? (
          <ul className="divide-y divide-[var(--hairline)]">
            {tops.map((d) => (
              <li key={d.id} className="list-none">
                <ul>{row(d)}{teamsOf(d.id).map((t) => row(t, true))}</ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-sm text-[var(--muted-foreground)]">No departments yet.</p>
        )}
      </section>

      {canManage ? (
        <form
          aria-label={editingId ? "Edit department" : "New department"}
          className="surface grain mt-4 space-y-3 rounded-[var(--r-lg)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <input aria-label="Department name" required maxLength={60} placeholder="New department or team, e.g. Engineering" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} flex-1`} />
            <select aria-label="Part of" value={draft.parentId ?? ""} onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })} className={field}>
              <option value="">A department</option>
              {tops.filter((d) => d.id !== editingId && !d.archived).map((d) => (
                <option key={d.id} value={d.id}>A team in {d.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label={`Budget (${baseCurrency})`} inputMode="decimal" placeholder={`Budget (${baseCurrency})`} value={draft.budgetMajor ?? ""} onChange={(e) => setDraft({ ...draft, budgetMajor: e.target.value.trim() || null })} className={`${field} w-36`} />
            <select aria-label="Budget period" value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value as GroupPeriod })} className={field}>
              {GROUP_PERIODS.map((p) => (
                <option key={p} value={p}>{GROUP_PERIOD_LABEL[p]}</option>
              ))}
            </select>
            <label className="text-xs text-[var(--muted-foreground)]">
              Alert at
              <input aria-label="Alert at percent" type="number" min={1} max={100} value={draft.alertPct} onChange={(e) => setDraft({ ...draft, alertPct: Number(e.target.value) || 80 })} className={`${field} ml-1 w-20`} />%
            </label>
          </div>
          {people.length ? (
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <legend className="mb-1 text-[var(--muted-foreground)]">Members (their expenses go here by default)</legend>
              {people.map((m) => (
                <label key={m.userId} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={draft.memberIds.includes(m.userId)} onChange={() => setDraft({ ...draft, memberIds: toggle(draft.memberIds, m.userId) })} />
                  {m.displayName}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]">
              {editingId ? "Save" : "Add"}
            </button>
            {editingId ? (
              <button type="button" className="h-10 rounded-lg border border-[var(--hairline)] px-3 text-sm text-[var(--muted-foreground)]" onClick={reset}>Cancel</button>
            ) : null}
          </div>
        </form>
      ) : null}

      <section aria-label="Project budgets" className="surface grain mt-8 rounded-[var(--r-lg)] px-4 pb-4">
        <h2 className="pt-4 text-sm font-medium">Projects</h2>
        {projectList.length ? <ul className="divide-y divide-[var(--hairline)]">{projectList.map(projectRow)}</ul> : <p className="py-3 text-sm text-[var(--muted-foreground)]">No projects yet.</p>}
        {canManage ? (
          <form
            aria-label="New project"
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (projectName.trim()) addProject.mutate();
            }}
          >
            <input aria-label="Project name" maxLength={80} placeholder="New project, e.g. Offsite 2027" value={projectName} onChange={(e) => setProjectName(e.target.value)} className={`${field} flex-1`} />
            <button type="submit" disabled={addProject.isPending} className="h-10 rounded-lg border border-[var(--hairline)] px-3 text-sm">Add project</button>
          </form>
        ) : null}
      </section>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </PageContainer>
  );
}
