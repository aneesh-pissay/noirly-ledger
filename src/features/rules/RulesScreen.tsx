"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api, type TransactionRuleBody } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { formatMinorToMajor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import type { RuleView } from "@/src/core/auto-rules";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";
const FIELD_LABEL = { any: "Note or merchant", note: "Note", merchant: "Merchant" } as const;
const OP_LABEL = { contains: "contains", starts_with: "starts with", equals: "is" } as const;

const blank = (): TransactionRuleBody => ({
  name: "",
  field: "any",
  op: "contains",
  value: "",
  type: null,
  accountId: null,
  minMajor: null,
  maxMajor: null,
  set: { categoryId: null, merchant: null, tags: [], projectId: null },
});

/**
 * Rules for incoming transactions: when a new expense or income's text
 * matches, fill in its category, merchant, tags or project. They run on
 * everything added (by hand or imported), only filling what's left empty.
 */
export function RulesScreen({ workspaceId, baseCurrency, canManage }: { workspaceId: string; baseCurrency: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const key = ["transaction-rules", workspaceId] as const;
  const rules = useQuery({ queryKey: key, queryFn: () => api.listTransactionRules(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId) });
  const [draft, setDraft] = useState<TransactionRuleBody>(blank);
  const [tagText, setTagText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const reset = () => {
    setDraft(blank());
    setTagText("");
    setEditingId(null);
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { ...draft, set: { ...draft.set, tags: tagText.split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean) } };
      return editingId ? api.updateTransactionRule(workspaceId, editingId, body) : api.createTransactionRule(workspaceId, body);
    },
    onSuccess: async () => {
      reset();
      setPreview(null);
      await refresh();
    },
  });
  const change = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: refresh });
  const check = useMutation({ mutationFn: () => api.applyTransactionRules(workspaceId, true), onSuccess: (r) => setPreview(r.changed) });
  const apply = useMutation({
    mutationFn: () => api.applyTransactionRules(workspaceId, false),
    onSuccess: async () => {
      setPreview(null);
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] })]);
    },
  });
  const error = save.error ?? change.error ?? check.error ?? apply.error;

  const list = rules.data?.rules ?? [];
  const catName = (id: string | null) => (id ? categories.data?.categories.find((c) => c.id === id)?.name ?? "a deleted category" : null);
  const projectName = (id: string | null) => (id ? projects.data?.projects.find((p) => p.id === id)?.name ?? "a project" : null);
  const accountName = (id: string | null) => (id ? accounts.data?.accounts.find((a) => a.id === id)?.name ?? "an account" : null);
  const describe = (r: RuleView) => {
    const when = [
      `${FIELD_LABEL[r.field]} ${OP_LABEL[r.op]} "${r.value}"`,
      r.type ? `${r.type === "expense" ? "spending" : "income"} only` : null,
      r.accountId ? `in ${accountName(r.accountId)}` : null,
      r.minMinor !== null ? `from ${money(r.minMinor, baseCurrency)}` : null,
      r.maxMinor !== null ? `up to ${money(r.maxMinor, baseCurrency)}` : null,
    ].filter(Boolean);
    const then = [
      r.set.categoryId ? `category ${catName(r.set.categoryId)}` : null,
      r.set.merchant ? `merchant ${r.set.merchant}` : null,
      r.set.tags.length ? r.set.tags.map((t) => `#${t}`).join(" ") : null,
      r.set.projectId ? `project ${projectName(r.set.projectId)}` : null,
    ].filter(Boolean);
    return { when: when.join(", "), then: then.join(" · ") };
  };
  const move = (i: number, by: -1 | 1) => {
    const ids = list.map((r) => r.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    change.mutate(() => api.reorderTransactionRules(workspaceId, ids));
  };
  const edit = (r: RuleView) => {
    setEditingId(r.id);
    setTagText(r.set.tags.join(" "));
    setDraft({
      name: r.name,
      field: r.field,
      op: r.op,
      value: r.value,
      type: r.type,
      accountId: r.accountId,
      minMajor: r.minMinor === null ? null : formatMinorToMajor(r.minMinor),
      maxMajor: r.maxMinor === null ? null : formatMinorToMajor(r.maxMinor),
      set: { ...r.set },
    });
  };

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Fill in new transactions automatically: when the note or merchant matches, set the category, a clean merchant name, tags or a project. Rules run on everything you add or import, top to bottom, and never change what you chose yourself.
      </p>

      <section aria-label="Rules" className="mt-6 surface grain rounded-[var(--r-lg)] p-4">
        {list.length ? (
          <ol className="space-y-3">
            {list.map((r, i) => {
              const d = describe(r);
              return (
                <li key={r.id} data-rule={r.name} className="flex flex-wrap items-start justify-between gap-2 border-t border-[var(--hairline)] pt-3 text-sm first:border-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="font-medium">{i + 1}. {r.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">When {d.when}</p>
                    <p className="text-xs">→ {d.then}</p>
                    <p className="font-mono text-[11px] text-[var(--muted-foreground)]">used {r.appliedCount} time{r.appliedCount === 1 ? "" : "s"}</p>
                  </div>
                  {canManage ? (
                    <span className="flex gap-2 text-xs text-[var(--muted-foreground)]">
                      <button type="button" aria-label={`Move ${r.name} up`} disabled={i === 0 || change.isPending} onClick={() => move(i, -1)} className="disabled:opacity-40">↑</button>
                      <button type="button" aria-label={`Move ${r.name} down`} disabled={i === list.length - 1 || change.isPending} onClick={() => move(i, 1)} className="disabled:opacity-40">↓</button>
                      <button type="button" className="underline" onClick={() => edit(r)}>Edit</button>
                      <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={change.isPending} onClick={() => { if (window.confirm(`Delete the rule ${r.name}?`)) change.mutate(() => api.deleteTransactionRule(workspaceId, r.id)); }}>Delete</button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No rules yet.</p>
        )}
        {canManage && list.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-3 text-xs">
            {preview === null ? (
              <Button type="button" variant="ghost" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>Apply to past transactions…</Button>
            ) : preview === 0 ? (
              <span className="text-[var(--muted-foreground)]" role="status">Nothing in the past to fill in.</span>
            ) : (
              <>
                <span role="status">{preview} past transaction{preview === 1 ? "" : "s"} would be filled in (only empty fields).</span>
                <Button type="button" size="sm" disabled={apply.isPending} onClick={() => apply.mutate()}>Fill them in</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(null)}>Cancel</Button>
              </>
            )}
            {apply.data ? <span className="text-[var(--muted-foreground)]">Filled in {apply.data.changed}.</span> : null}
          </div>
        ) : null}
      </section>

      {canManage ? (
        <form
          aria-label={editingId ? "Edit rule" : "New rule"}
          className="mt-4 space-y-3 surface grain rounded-[var(--r-lg)] p-4 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input aria-label="Rule name" required maxLength={60} placeholder="Rule name, e.g. Food delivery" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} w-full`} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">When</span>
            <select aria-label="Look in" value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value as TransactionRuleBody["field"] })} className={field}>
              {(Object.keys(FIELD_LABEL) as Array<keyof typeof FIELD_LABEL>).map((f) => <option key={f} value={f}>{FIELD_LABEL[f]}</option>)}
            </select>
            <select aria-label="Match" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as TransactionRuleBody["op"] })} className={field}>
              {(Object.keys(OP_LABEL) as Array<keyof typeof OP_LABEL>).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
            </select>
            <input aria-label="Text to look for" required maxLength={120} placeholder="e.g. swiggy" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} className={`${field} min-w-0 flex-1`} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--muted-foreground)]">Only</span>
            <select aria-label="Type" value={draft.type ?? ""} onChange={(e) => setDraft({ ...draft, type: (e.target.value || null) as TransactionRuleBody["type"] })} className={field}>
              <option value="">spending and income</option>
              <option value="expense">spending</option>
              <option value="income">income</option>
            </select>
            <select aria-label="Account" value={draft.accountId ?? ""} onChange={(e) => setDraft({ ...draft, accountId: e.target.value || null })} className={field}>
              <option value="">in any account</option>
              {(accounts.data?.accounts ?? []).filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>in {a.name}</option>)}
            </select>
            <input aria-label={`From amount (${baseCurrency})`} inputMode="decimal" placeholder="from" value={draft.minMajor ?? ""} onChange={(e) => setDraft({ ...draft, minMajor: e.target.value.trim() || null })} className={`${field} w-24`} />
            <input aria-label={`Up to amount (${baseCurrency})`} inputMode="decimal" placeholder="up to" value={draft.maxMajor ?? ""} onChange={(e) => setDraft({ ...draft, maxMajor: e.target.value.trim() || null })} className={`${field} w-24`} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--muted-foreground)]">Set</span>
            <select aria-label="Set category" value={draft.set.categoryId ?? ""} onChange={(e) => setDraft({ ...draft, set: { ...draft.set, categoryId: e.target.value || null } })} className={field}>
              <option value="">no category</option>
              {categoryTree(categories.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input aria-label="Set merchant" maxLength={120} placeholder="merchant name" value={draft.set.merchant ?? ""} onChange={(e) => setDraft({ ...draft, set: { ...draft.set, merchant: e.target.value || null } })} className={`${field} w-40`} />
            <input aria-label="Add tags" placeholder="tags" value={tagText} onChange={(e) => setTagText(e.target.value)} className={`${field} w-32`} />
            <select aria-label="Set project" value={draft.set.projectId ?? ""} onChange={(e) => setDraft({ ...draft, set: { ...draft.set, projectId: e.target.value || null } })} className={field}>
              <option value="">no project</option>
              {(projects.data?.projects ?? []).filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>{editingId ? "Save rule" : "Add rule"}</Button>
            {editingId ? <Button type="button" variant="ghost" onClick={reset}>Cancel</Button> : null}
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
    </PageContainer>
  );
}
