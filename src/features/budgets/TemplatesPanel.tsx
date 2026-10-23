"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";

type Props = { workspaceId: string; baseCurrency: string };

/** Budget templates: apply a built-in or saved set of budgets, or save the current ones for later. */
export function TemplatesPanel({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: qk.budgetTemplates(workspaceId), queryFn: () => api.listBudgetTemplates(workspaceId) });
  const [income, setIncome] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useMutation({
    mutationFn: ({ id, needsIncome }: { id: string; needsIncome: boolean }) => api.applyBudgetTemplate(workspaceId, id, needsIncome ? income.trim() || null : null),
    onMutate: () => { setError(null); setMessage(null); },
    onSuccess: (result) => {
      setMessage(`Set ${result.budgets} budget${result.budgets === 1 ? "" : "s"}${result.categoriesCreated ? `, adding ${result.categoriesCreated} categor${result.categoriesCreated === 1 ? "y" : "ies"}` : ""}.`);
      void queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: qk.categories(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
  });
  const save = useMutation({
    mutationFn: () => api.saveBudgetTemplate(workspaceId, name.trim()),
    onMutate: () => { setError(null); setMessage(null); },
    onSuccess: () => { setName(""); setMessage("Template saved."); void queryClient.invalidateQueries({ queryKey: qk.budgetTemplates(workspaceId) }); },
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteBudgetTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.budgetTemplates(workspaceId) }),
    onError: (err: Error) => setError(err.message),
  });

  const list = templates.data?.templates ?? [];
  return (
    <section aria-label="Budget templates" className="mt-6 surface grain rounded-[var(--r-lg)] p-4">
      <h2 className="text-sm font-medium">Start from a template</h2>
      <p className="text-xs text-[var(--muted-foreground)]">Applying one sets each of its budgets, adding any category that&apos;s missing. Budgets you already have for other categories stay.</p>
      <div className="mt-3 max-w-xs">
        <Label htmlFor="tpl-income">Monthly income ({baseCurrency}), for shares of income</Label>
        <Input id="tpl-income" inputMode="decimal" className="font-mono" value={income} onChange={(e) => setIncome(e.target.value)} />
      </div>
      <ul className="mt-3 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
        {list.map((template) => (
          <li key={template.id} data-template={template.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{template.name}{template.builtIn ? <span className="ml-2 font-mono text-[10px] text-[var(--muted-foreground)]">BUILT IN</span> : null}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{template.description}</p>
            </div>
            <Button size="sm" variant="ghost" disabled={apply.isPending} onClick={() => apply.mutate({ id: template.id, needsIncome: template.needsIncome })}>
              Apply
            </Button>
            {!template.builtIn ? (
              <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]" aria-label={`Delete ${template.name}`} onClick={() => remove.mutate(template.id)}>
                Delete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(); }}>
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="tpl-name">Save the current budgets as</Label>
          <Input id="tpl-name" value={name} maxLength={80} placeholder="e.g. Normal month" onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" variant="ghost" disabled={save.isPending || !name.trim()}>Save template</Button>
      </form>
      {message ? <p role="status" className="mt-3 text-sm text-[var(--balance-positive)]">{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}
    </section>
  );
}
