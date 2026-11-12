"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { formatMinorToMajor, parseMajorToMinor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import {
  FIELD_OPS,
  PLACEHOLDERS,
  TRIGGER_FIELDS,
  TRIGGER_LABEL,
  TRIGGERS,
  type Action,
  type ActionType,
  type Condition,
  type ConditionField,
  type ConditionOp,
  type Trigger,
  type WorkflowBody,
  type WorkflowView,
} from "@/src/core/workflows";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";
const FIELD_LABEL: Record<ConditionField, string> = { type: "Type", amount: "Amount", category: "Category", merchant: "Merchant", account: "Account", tag: "Tag", pool: "Pool", member: "Member" };
const OP_LABEL: Record<ConditionOp, string> = { is: "is", is_not: "isn't", contains: "contains", gte: "is at least", lte: "is at most" };
const ACTION_LABEL: Record<ActionType, string> = { notify: "Notify", email: "Email", add_tags: "Add tags", set_category: "Set category", set_project: "Set project", comment: "Comment" };
const AUDIENCE_LABEL = { approvers: "approvers", owners: "owners", member: "who added it", people: "these people" } as const;

const blankAction = (type: ActionType): Action => {
  if (type === "notify" || type === "email") return { type, audience: "owners", userIds: [], message: "{{member}} added {{amount}} at {{merchant}}" };
  if (type === "add_tags") return { type, tags: [] };
  if (type === "set_category") return { type, categoryId: "" };
  if (type === "set_project") return { type, projectId: "" };
  return { type: "comment", message: "" };
};

const blank = (trigger: Trigger): WorkflowBody => ({ name: "", enabled: true, trigger, conditions: [], actions: [blankAction("notify")] });

/** Amount conditions are kept in minor units and typed in major ones. */
const toMinorText = (major: string) => (/^\d+(\.\d{1,2})?$/.test(major.trim()) ? String(parseMajorToMinor(major.trim())) : major);

/**
 * Workflows: when something happens and it fits the conditions, do the
 * actions. Every run is listed with what it did.
 */
export function WorkflowsScreen({ workspaceId, kind, baseCurrency, canManage }: { workspaceId: string; kind: "personal" | "team"; baseCurrency: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const key = ["workflows", workspaceId] as const;
  const triggers = TRIGGERS.filter((t) => kind === "team" || !t.startsWith("expense."));
  const workflows = useQuery({ queryKey: key, queryFn: () => api.listWorkflows(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId) });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const pools = useQuery({ queryKey: qk.budgetPools(workspaceId), queryFn: () => api.listPools(workspaceId), enabled: kind === "team" });
  const [draft, setDraft] = useState<WorkflowBody>(() => blank(triggers[0]!));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openRuns, setOpenRuns] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const reset = () => {
    setDraft(blank(triggers[0]!));
    setEditingId(null);
  };
  const save = useMutation({
    mutationFn: () => {
      const body: WorkflowBody = { ...draft, conditions: draft.conditions.map((c) => (c.field === "amount" ? { ...c, value: toMinorText(c.value) } : c)) };
      return editingId ? api.updateWorkflow(workspaceId, editingId, body) : api.createWorkflow(workspaceId, body);
    },
    onSuccess: async () => {
      reset();
      await refresh();
    },
  });
  const change = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: refresh });
  const error = save.error ?? change.error;

  const people = members.data?.members ?? [];
  const nameOf = (field: ConditionField, value: string) => {
    if (field === "category") return categories.data?.categories.find((c) => c.id === value)?.name ?? "a category";
    if (field === "account") return accounts.data?.accounts.find((a) => a.id === value)?.name ?? "an account";
    if (field === "pool") return pools.data?.pools.find((p) => p.id === value)?.name ?? "a pool";
    if (field === "member") return people.find((m) => m.userId === value)?.displayName ?? "someone";
    if (field === "amount") return money(Number(value), baseCurrency);
    if (field === "tag") return `#${value.replace(/^#/, "")}`;
    return value;
  };
  const describeAction = (a: Action) => {
    if (a.type === "notify" || a.type === "email") return `${ACTION_LABEL[a.type]} ${a.audience === "people" ? a.userIds.map((id) => people.find((m) => m.userId === id)?.displayName ?? "someone").join(", ") : AUDIENCE_LABEL[a.audience]}`;
    if (a.type === "add_tags") return `Tag ${a.tags.map((t) => `#${t}`).join(" ")}`;
    if (a.type === "set_category") return `Category → ${nameOf("category", a.categoryId)}`;
    if (a.type === "set_project") return `Project → ${projects.data?.projects.find((p) => p.id === a.projectId)?.name ?? "a project"}`;
    return "Comment";
  };
  const edit = (w: WorkflowView) => {
    setEditingId(w.id);
    setDraft({ name: w.name, enabled: w.enabled, trigger: w.trigger, conditions: w.conditions.map((c) => (c.field === "amount" ? { ...c, value: formatMinorToMajor(Number(c.value)) } : c)), actions: w.actions });
  };
  const setCondition = (i: number, c: Condition) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? c : x)) });
  const setAction = (i: number, a: Action) => setDraft({ ...draft, actions: draft.actions.map((x, j) => (j === i ? a : x)) });

  const valueInput = (c: Condition, i: number) => {
    const set = (value: string) => setCondition(i, { ...c, value });
    const select = (options: Array<{ value: string; label: string }>) => (
      <select aria-label={`Condition ${i + 1} value`} value={c.value} onChange={(e) => set(e.target.value)} className={field}>
        <option value="">Pick…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    if (c.field === "type") return select(["expense", "income", "refund", "transfer"].map((t) => ({ value: t, label: t })));
    if (c.field === "category") return select(categoryTree(categories.data?.categories ?? []).map((x) => ({ value: x.id, label: x.label })));
    if (c.field === "account") return select((accounts.data?.accounts ?? []).map((a) => ({ value: a.id, label: a.name })));
    if (c.field === "pool") return select((pools.data?.pools ?? []).map((p) => ({ value: p.id, label: p.name })));
    if (c.field === "member") return select(people.map((m) => ({ value: m.userId, label: m.displayName })));
    return <input aria-label={`Condition ${i + 1} value`} inputMode={c.field === "amount" ? "decimal" : undefined} placeholder={c.field === "amount" ? baseCurrency : ""} value={c.value} onChange={(e) => set(e.target.value)} className={`${field} w-36`} />;
  };

  const actionInputs = (a: Action, i: number) => {
    if (a.type === "notify" || a.type === "email") {
      return (
        <div className="w-full space-y-2">
          <select aria-label={`Action ${i + 1} who`} value={a.audience} onChange={(e) => setAction(i, { ...a, audience: e.target.value as typeof a.audience })} className={field}>
            {(Object.keys(AUDIENCE_LABEL) as Array<keyof typeof AUDIENCE_LABEL>).map((k) => <option key={k} value={k}>{AUDIENCE_LABEL[k]}</option>)}
          </select>
          {a.audience === "people" ? (
            <div className="flex flex-wrap gap-x-3 text-xs">
              {people.map((m) => (
                <label key={m.userId} className="flex items-center gap-1">
                  <input type="checkbox" checked={a.userIds.includes(m.userId)} onChange={() => setAction(i, { ...a, userIds: a.userIds.includes(m.userId) ? a.userIds.filter((x) => x !== m.userId) : [...a.userIds, m.userId] })} />
                  {m.displayName}
                </label>
              ))}
            </div>
          ) : null}
          <input aria-label={`Action ${i + 1} message`} maxLength={500} value={a.message} onChange={(e) => setAction(i, { ...a, message: e.target.value })} className={`${field} w-full`} />
        </div>
      );
    }
    if (a.type === "add_tags") return <input aria-label={`Action ${i + 1} tags`} placeholder="tags" value={a.tags.join(" ")} onChange={(e) => setAction(i, { ...a, tags: e.target.value.split(/[\s,]+/).filter(Boolean) })} className={`${field} w-48`} />;
    if (a.type === "set_category") {
      return (
        <select aria-label={`Action ${i + 1} category`} value={a.categoryId} onChange={(e) => setAction(i, { ...a, categoryId: e.target.value })} className={field}>
          <option value="">Pick…</option>
          {categoryTree(categories.data?.categories ?? []).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      );
    }
    if (a.type === "set_project") {
      return (
        <select aria-label={`Action ${i + 1} project`} value={a.projectId} onChange={(e) => setAction(i, { ...a, projectId: e.target.value })} className={field}>
          <option value="">Pick…</option>
          {(projects.data?.projects ?? []).filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      );
    }
    return <input aria-label={`Action ${i + 1} message`} maxLength={500} value={a.message} onChange={(e) => setAction(i, { ...a, message: e.target.value })} className={`${field} w-full`} />;
  };

  const list = workflows.data?.workflows ?? [];
  const fields = TRIGGER_FIELDS[draft.trigger];
  const actionTypes = (Object.keys(ACTION_LABEL) as ActionType[]).filter((t) => draft.trigger !== "budget.alert" || t === "notify" || t === "email");

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">When something happens and it fits your conditions, Ledger does the rest: tells people, tags or files the transaction, or leaves a comment. What a workflow changes never sets one off again.</p>

      <section aria-label="Workflows" className="mt-6 space-y-3">
        {list.length ? list.map((w) => (
          <article key={w.id} data-workflow={w.name} className={`surface grain rounded-[var(--r-lg)] p-4 text-sm ${w.enabled ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{w.name}{w.enabled ? null : <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">off</span>}</p>
              {canManage ? (
                <span className="flex gap-3 text-xs text-[var(--muted-foreground)]">
                  <button type="button" className="underline" disabled={change.isPending} onClick={() => change.mutate(() => api.updateWorkflow(workspaceId, w.id, { name: w.name, enabled: !w.enabled, trigger: w.trigger, conditions: w.conditions, actions: w.actions }))}>{w.enabled ? "Turn off" : "Turn on"}</button>
                  <button type="button" className="underline" onClick={() => edit(w)}>Edit</button>
                  <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={change.isPending} onClick={() => { if (window.confirm(`Delete ${w.name}?`)) change.mutate(() => api.deleteWorkflow(workspaceId, w.id)); }}>Delete</button>
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              When {TRIGGER_LABEL[w.trigger].toLowerCase()}
              {w.conditions.length ? `, if ${w.conditions.map((c) => `${FIELD_LABEL[c.field].toLowerCase()} ${OP_LABEL[c.op]} ${nameOf(c.field, c.value)}`).join(" and ")}` : ""}
            </p>
            <p className="text-xs">→ {w.actions.map(describeAction).join(" · ")}</p>
            <button type="button" className="mt-1 text-xs text-[var(--muted-foreground)] underline" onClick={() => setOpenRuns(openRuns === w.id ? null : w.id)}>
              Ran {w.runCount} time{w.runCount === 1 ? "" : "s"}{w.lastRunAt ? `, last ${new Date(w.lastRunAt).toLocaleString()}` : ""}
            </button>
            {openRuns === w.id ? (
              <ul aria-label={`${w.name} runs`} className="mt-2 space-y-1 text-xs">
                {w.runs.length ? w.runs.map((r) => (
                  <li key={r.id} data-run className={r.ok ? "" : "text-[var(--balance-negative)]"}>
                    {new Date(r.at).toLocaleString()} · {r.summary ?? ""} — {r.results.join("; ")}
                  </li>
                )) : <li className="text-[var(--muted-foreground)]">No runs yet.</li>}
              </ul>
            ) : null}
          </article>
        )) : <p className="text-sm text-[var(--muted-foreground)]">No workflows yet.</p>}
      </section>

      {canManage ? (
        <form
          aria-label={editingId ? "Edit workflow" : "New workflow"}
          className="mt-6 space-y-4 surface grain rounded-[var(--r-lg)] p-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input aria-label="Workflow name" required maxLength={80} placeholder="e.g. Big spend alert" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} w-full`} />
          <label className="flex flex-wrap items-center gap-2">
            <span className="w-12 text-xs text-[var(--muted-foreground)]">When</span>
            <select aria-label="Trigger" value={draft.trigger} onChange={(e) => {
              const trigger = e.target.value as Trigger;
              setDraft({ ...draft, trigger, conditions: draft.conditions.filter((c) => TRIGGER_FIELDS[trigger].includes(c.field)), actions: trigger === "budget.alert" ? draft.actions.filter((a) => a.type === "notify" || a.type === "email") : draft.actions });
            }} className={field}>
              {triggers.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs text-[var(--muted-foreground)]">If (all of these)</legend>
            {draft.conditions.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select aria-label={`Condition ${i + 1} field`} value={c.field} onChange={(e) => { const f = e.target.value as ConditionField; setCondition(i, { field: f, op: FIELD_OPS[f][0]!, value: "" }); }} className={field}>
                  {fields.map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
                </select>
                <select aria-label={`Condition ${i + 1} comparison`} value={c.op} onChange={(e) => setCondition(i, { ...c, op: e.target.value as ConditionOp })} className={field}>
                  {FIELD_OPS[c.field].map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                </select>
                {valueInput(c, i)}
                <button type="button" className="text-xs text-[var(--muted-foreground)] underline" onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            {draft.conditions.length < 10 ? (
              <button type="button" className="text-xs text-[var(--muted-foreground)] underline" onClick={() => { const f = fields[0]!; setDraft({ ...draft, conditions: [...draft.conditions, { field: f, op: FIELD_OPS[f][0]!, value: "" }] }); }}>Add a condition</button>
            ) : null}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-xs text-[var(--muted-foreground)]">Then</legend>
            {draft.actions.map((a, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2 border-l-2 border-[var(--hairline)] pl-3">
                <select aria-label={`Action ${i + 1}`} value={a.type} onChange={(e) => setAction(i, blankAction(e.target.value as ActionType))} className={field}>
                  {actionTypes.map((t) => <option key={t} value={t}>{ACTION_LABEL[t]}</option>)}
                </select>
                {actionInputs(a, i)}
                {draft.actions.length > 1 ? <button type="button" className="text-xs text-[var(--muted-foreground)] underline" onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}>Remove</button> : null}
              </div>
            ))}
            {draft.actions.length < 5 ? <button type="button" className="text-xs text-[var(--muted-foreground)] underline" onClick={() => setDraft({ ...draft, actions: [...draft.actions, blankAction("notify")] })}>Add an action</button> : null}
            <p className="text-[11px] text-[var(--muted-foreground)]">Messages can use {PLACEHOLDERS.map((p) => `{{${p}}}`).join(" ")}.</p>
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>{editingId ? "Save workflow" : "Add workflow"}</Button>
            {editingId ? <Button type="button" variant="ghost" onClick={reset}>Cancel</Button> : null}
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </PageContainer>
  );
}
