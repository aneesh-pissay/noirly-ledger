"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApprovalRuleBody } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { describeConditions, describeStep, type ApprovalStepSpec } from "@/src/core/approval-rules";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { formatMinorToMajor } from "@/src/core/money";
import type { ApprovalRuleView } from "@/src/core/sync/types";

const field = "h-10 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-sm";

function rulesKey(workspaceId: string) {
  return ["approvals", workspaceId, "rules"] as const;
}

const blank = (): ApprovalRuleBody => ({ name: "", minMajor: null, maxMajor: null, categoryIds: [], budgetPoolIds: [], steps: [{ kind: "any", userIds: [] }] });

/** A step as the picker holds it: "any", "owners", or "user:<id>" for one named member. */
function stepValue(step: ApprovalStepSpec) {
  return step.kind === "members" ? `user:${step.userIds[0] ?? ""}` : step.kind;
}

function stepFrom(value: string): ApprovalStepSpec {
  if (value.startsWith("user:")) return { kind: "members", userIds: [value.slice(5)] };
  return { kind: value as "any" | "owners" | "pool", userIds: [] };
}

/**
 * Which expenses need which chain of approvers. Rules are tried top to
 * bottom and the first that fits decides; an expense no rule fits needs one
 * approval from any approver. Everyone sees the rules; owners change them.
 */
export function ApprovalRules({ workspaceId, baseCurrency, canManage }: { workspaceId: string; baseCurrency: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const rules = useQuery({ queryKey: rulesKey(workspaceId), queryFn: () => api.listApprovalRules(workspaceId) });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const pools = useQuery({ queryKey: qk.budgetPools(workspaceId), queryFn: () => api.listPools(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const [draft, setDraft] = useState<ApprovalRuleBody>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: rulesKey(workspaceId) });
  const save = useMutation({
    mutationFn: () => (editingId ? api.updateApprovalRule(workspaceId, editingId, draft) : api.createApprovalRule(workspaceId, draft)),
    onSuccess: async () => {
      setDraft(blank());
      setEditingId(null);
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteApprovalRule(workspaceId, id), onSuccess: refresh });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.reorderApprovalRules(workspaceId, ids), onSuccess: refresh });
  const error = save.error ?? remove.error ?? reorder.error;

  const list = rules.data?.rules ?? [];
  const people = members.data?.members ?? [];
  const nameOf = (id: string) => people.find((m) => m.userId === id)?.displayName;
  const poolList = (pools.data?.pools ?? []).filter((p) => !p.archivedAt);
  const topCategories = (categories.data?.categories ?? []).filter((c) => !c.parentId && !c.archivedAt && !c.deletedAt);
  const labels = {
    money: (minor: number) => money(minor, baseCurrency),
    category: (id: string) => categories.data?.categories.find((c) => c.id === id)?.name,
    pool: (id: string) => pools.data?.pools.find((p) => p.id === id)?.name,
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const move = (index: number, by: -1 | 1) => {
    const ids = list.map((r) => r.id);
    [ids[index], ids[index + by]] = [ids[index + by]!, ids[index]!];
    reorder.mutate(ids);
  };
  const edit = (r: ApprovalRuleView) => {
    setEditingId(r.id);
    setDraft({
      name: r.name,
      minMajor: r.minAmountMinor === null ? null : formatMinorToMajor(r.minAmountMinor),
      maxMajor: r.maxAmountMinor === null ? null : formatMinorToMajor(r.maxAmountMinor),
      categoryIds: r.categoryIds,
      budgetPoolIds: r.budgetPoolIds,
      steps: r.steps,
    });
  };
  const setStep = (i: number, step: ApprovalStepSpec) => setDraft({ ...draft, steps: draft.steps.map((s, j) => (j === i ? step : s)) });

  return (
    <section aria-label="Approval rules" className="surface grain mt-8 space-y-4 rounded-[var(--r-lg)] p-4">
      <div>
        <h2 className="text-sm font-medium">Approval rules</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Tried top to bottom; the first that fits an expense sets who approves it, in order. An expense no rule fits needs one approval from any approver. Changing a rule doesn&apos;t move expenses already submitted.
        </p>
      </div>

      {list.length ? (
        <ol className="space-y-3">
          {list.map((r, i) => (
            <li key={r.id} data-rule={r.name} className="flex flex-wrap items-start justify-between gap-2 border-t border-[var(--hairline)] pt-3 first:border-0 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{i + 1}. {r.name}</p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{describeConditions(r, labels)}</p>
                <p className="mt-1 text-xs">{r.steps.map((s) => describeStep(s, nameOf)).join(" → ")}</p>
              </div>
              {canManage ? (
                <span className="flex gap-2 text-xs text-[var(--muted-foreground)]">
                  <button type="button" aria-label={`Move ${r.name} up`} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="disabled:opacity-40">↑</button>
                  <button type="button" aria-label={`Move ${r.name} down`} disabled={i === list.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="disabled:opacity-40">↓</button>
                  <button type="button" className="underline" onClick={() => edit(r)}>Edit</button>
                  <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete the rule ${r.name}?`)) remove.mutate(r.id); }}>Delete</button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">No rules yet: every expense needs one approval.</p>
      )}

      {canManage ? (
        <form
          aria-label={editingId ? "Edit rule" : "New rule"}
          className="space-y-3 border-t border-[var(--hairline)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <input aria-label="Rule name" required maxLength={60} placeholder="New rule, e.g. Large travel" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} flex-1`} />
            <input aria-label={`From amount (${baseCurrency})`} inputMode="decimal" placeholder={`From (${baseCurrency})`} value={draft.minMajor ?? ""} onChange={(e) => setDraft({ ...draft, minMajor: e.target.value.trim() || null })} className={`${field} w-32`} />
            <input aria-label={`Up to amount (${baseCurrency})`} inputMode="decimal" placeholder={`Up to (${baseCurrency})`} value={draft.maxMajor ?? ""} onChange={(e) => setDraft({ ...draft, maxMajor: e.target.value.trim() || null })} className={`${field} w-32`} />
          </div>
          {poolList.length ? (
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <legend className="mb-1 text-[var(--muted-foreground)]">Pools (none ticked: any)</legend>
              {poolList.map((p) => (
                <label key={p.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={draft.budgetPoolIds.includes(p.id)} onChange={() => setDraft({ ...draft, budgetPoolIds: toggle(draft.budgetPoolIds, p.id) })} />
                  {p.name}
                </label>
              ))}
            </fieldset>
          ) : null}
          {topCategories.length ? (
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <legend className="mb-1 text-[var(--muted-foreground)]">Categories, with their subcategories (none ticked: any)</legend>
              {topCategories.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={draft.categoryIds.includes(c.id)} onChange={() => setDraft({ ...draft, categoryIds: toggle(draft.categoryIds, c.id) })} />
                  {c.name}
                </label>
              ))}
            </fieldset>
          ) : null}
          <fieldset className="space-y-2 text-xs">
            <legend className="mb-1 text-[var(--muted-foreground)]">Approved by, in order</legend>
            {draft.steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-12 font-mono text-[var(--muted-foreground)]">Step {i + 1}</span>
                <select aria-label={`Step ${i + 1} approver`} value={stepValue(s)} onChange={(e) => setStep(i, stepFrom(e.target.value))} className={`${field} h-9 text-xs`}>
                  <option value="any">Any approver</option>
                  <option value="owners">An owner</option>
                  <option value="pool">The pool&apos;s approvers</option>
                  {people.map((m) => (
                    <option key={m.userId} value={`user:${m.userId}`}>{m.displayName}</option>
                  ))}
                </select>
                {draft.steps.length > 1 ? (
                  <button type="button" className="underline text-[var(--muted-foreground)]" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>Remove</button>
                ) : null}
              </div>
            ))}
            {draft.steps.length < 5 ? (
              <button type="button" className="underline text-[var(--muted-foreground)]" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { kind: "owners", userIds: [] }] })}>Add a step</button>
            ) : null}
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]">
              {editingId ? "Save rule" : "Add rule"}
            </button>
            {editingId ? (
              <button type="button" className="h-10 rounded-lg border border-[var(--hairline)] px-3 text-sm text-[var(--muted-foreground)]" onClick={() => { setEditingId(null); setDraft(blank()); }}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </section>
  );
}
