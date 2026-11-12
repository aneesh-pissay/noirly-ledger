"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SpendingPolicyBody } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { describePolicy, type SpendingPolicyView } from "@/src/core/spending-policies";
import { describeConditions } from "@/src/core/approval-rules";
import { formatMinorToMajor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

const field = "h-10 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 text-sm";

function policiesKey(workspaceId: string) {
  // Under "approvals", so a change refreshes the flags in the inbox.
  return ["approvals", workspaceId, "policies"] as const;
}

const blank = (): SpendingPolicyBody => ({ name: "", categoryIds: [], merchants: [], budgetPoolIds: [], maxMajor: null, receiptOverMajor: null, disallowed: false, enforcement: "flag" });

/**
 * What the workspace allows on submitted expenses: caps per expense,
 * receipts from an amount, and spend that isn't allowed, by category,
 * merchant and pool. Each either flags an expense for its approvers or
 * stops it being submitted. Everyone sees them; owners change them.
 */
export function SpendingPolicies({ workspaceId, baseCurrency, canManage }: { workspaceId: string; baseCurrency: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const policies = useQuery({ queryKey: policiesKey(workspaceId), queryFn: () => api.listPolicies(workspaceId) });
  const pools = useQuery({ queryKey: qk.budgetPools(workspaceId), queryFn: () => api.listPools(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const [draft, setDraft] = useState<SpendingPolicyBody>(blank);
  const [merchantText, setMerchantText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["approvals", workspaceId] });
  const reset = () => {
    setDraft(blank());
    setMerchantText("");
    setEditingId(null);
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { ...draft, merchants: merchantText.split(",").map((m) => m.trim()).filter(Boolean) };
      return editingId ? api.updatePolicy(workspaceId, editingId, body) : api.createPolicy(workspaceId, body);
    },
    onSuccess: async () => {
      reset();
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deletePolicy(workspaceId, id), onSuccess: refresh });
  const error = save.error ?? remove.error;

  const list = policies.data?.policies ?? [];
  const poolList = (pools.data?.pools ?? []).filter((p) => !p.archivedAt);
  const topCategories = (categories.data?.categories ?? []).filter((c) => !c.parentId && !c.archivedAt && !c.deletedAt);
  const fmt = (minor: number) => money(minor, baseCurrency);
  const scope = (p: SpendingPolicyView) => {
    const where = describeConditions(
      { minAmountMinor: null, maxAmountMinor: null, categoryIds: p.categoryIds, budgetPoolIds: p.budgetPoolIds },
      { money: fmt, category: (id) => categories.data?.categories.find((c) => c.id === id)?.name, pool: (id) => pools.data?.pools.find((x) => x.id === id)?.name },
    );
    return p.merchantNames.length ? `${where}${where === "Every expense" ? "" : ","} at ${p.merchantNames.join(", ")}` : where;
  };
  const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const edit = (p: SpendingPolicyView) => {
    setEditingId(p.id);
    setMerchantText(p.merchantNames.join(", "));
    setDraft({
      name: p.name,
      categoryIds: p.categoryIds,
      merchants: p.merchantNames,
      budgetPoolIds: p.budgetPoolIds,
      maxMajor: p.maxAmountMinor === null ? null : formatMinorToMajor(p.maxAmountMinor),
      receiptOverMajor: p.receiptOverMinor === null ? null : formatMinorToMajor(p.receiptOverMinor),
      disallowed: p.disallowed,
      enforcement: p.enforcement,
    });
  };

  return (
    <section aria-label="Spending policies" className="surface grain mt-8 space-y-4 rounded-[var(--r-lg)] p-4">
      <div>
        <h2 className="text-sm font-medium">Spending policies</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Limits, receipt rules and spend that isn&apos;t allowed. A policy that flags shows its approvers what&apos;s wrong; one that blocks stops the expense being submitted. Attaching a receipt later clears a receipt flag.
        </p>
      </div>
      {list.length ? (
        <ul className="space-y-3">
          {list.map((p) => (
            <li key={p.id} data-policy={p.name} className="flex flex-wrap items-start justify-between gap-2 border-t border-[var(--hairline)] pt-3 first:border-0 first:pt-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {p.name}
                  <span className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${p.enforcement === "block" ? "bg-[var(--balance-negative)]/15 text-[var(--balance-negative)]" : "bg-[var(--accent)]/15 text-[var(--accent)]"}`}>
                    {p.enforcement === "block" ? "Blocks" : "Flags"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{scope(p)}</p>
                <p className="mt-1 text-xs">{describePolicy(p, fmt)}</p>
              </div>
              {canManage ? (
                <span className="flex gap-2 text-xs text-[var(--muted-foreground)]">
                  <button type="button" className="underline" onClick={() => edit(p)}>Edit</button>
                  <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete the policy ${p.name}?`)) remove.mutate(p.id); }}>Delete</button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">No policies: any expense can be submitted.</p>
      )}

      {canManage ? (
        <form
          aria-label={editingId ? "Edit policy" : "New policy"}
          className="space-y-3 border-t border-[var(--hairline)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <input aria-label="Policy name" required maxLength={60} placeholder="New policy, e.g. Meals" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} flex-1`} />
            <select aria-label="When broken" value={draft.enforcement} onChange={(e) => setDraft({ ...draft, enforcement: e.target.value as "flag" | "block" })} className={field}>
              <option value="flag">Flag for approvers</option>
              <option value="block">Block submitting</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.disallowed} onChange={(e) => setDraft({ ...draft, disallowed: e.target.checked })} />
            This spend isn&apos;t allowed at all
          </label>
          {!draft.disallowed ? (
            <div className="flex flex-wrap gap-2">
              <input aria-label={`Limit per expense (${baseCurrency})`} inputMode="decimal" placeholder={`Limit each (${baseCurrency})`} value={draft.maxMajor ?? ""} onChange={(e) => setDraft({ ...draft, maxMajor: e.target.value.trim() || null })} className={`${field} w-40`} />
              <input aria-label={`Receipt from (${baseCurrency})`} inputMode="decimal" placeholder="Receipt from (0: always)" value={draft.receiptOverMajor ?? ""} onChange={(e) => setDraft({ ...draft, receiptOverMajor: e.target.value.trim() || null })} className={`${field} w-48`} />
            </div>
          ) : null}
          <input aria-label="Merchants" placeholder="Merchants, comma-separated (blank: any)" value={merchantText} onChange={(e) => setMerchantText(e.target.value)} className={`${field} w-full`} />
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
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]">
              {editingId ? "Save policy" : "Add policy"}
            </button>
            {editingId ? (
              <button type="button" className="h-10 rounded-lg border border-[var(--hairline)] px-3 text-sm text-[var(--muted-foreground)]" onClick={reset}>Cancel</button>
            ) : null}
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </section>
  );
}
