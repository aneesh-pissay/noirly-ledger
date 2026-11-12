"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { filtersToQuery, sameFilters, type ViewFilters } from "@/src/core/search";
import { Select } from "@/src/components/Select";
import type { Category } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  /** Where the list lives; filters go in its query string. */
  basePath: string;
  filters: ViewFilters;
  categories: Category[];
};

/** Search and filters for the transaction list, kept in the address so they can be shared, plus saved views. */
export function FiltersBar({ workspaceId, basePath, filters, categories }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const views = useQuery({ queryKey: qk.views(workspaceId), queryFn: () => api.listViews(workspaceId) });
  const [text, setText] = useState(filters.q ?? "");
  const [more, setMore] = useState(Boolean(filters.from || filters.to || filters.min || filters.max || filters.clearing));
  const [viewName, setViewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (next: ViewFilters) => {
    const query = filtersToQuery(next);
    router.push(query ? `${basePath}?${query}` : basePath);
  };
  const set = (key: keyof ViewFilters, value: string) => go({ ...filters, [key]: value || undefined });

  const save = useMutation({
    mutationFn: () => api.saveView(workspaceId, { name: viewName.trim(), filters: filters as Record<string, string> }),
    onMutate: () => setError(null),
    onSuccess: () => { setViewName(""); void queryClient.invalidateQueries({ queryKey: qk.views(workspaceId) }); },
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteView(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.views(workspaceId) }),
  });

  const active = Object.keys(filters).length > 0;
  const current = (views.data?.views ?? []).find((view) => sameFilters(view.filters, filters));

  return (
    <section aria-label="Search and filters" className="mt-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <form
          role="search"
          className="min-w-[14rem] flex-1"
          onSubmit={(e) => { e.preventDefault(); set("q", text.trim()); }}
        >
          <Label htmlFor="tx-search">Search</Label>
          <Input
            id="tx-search"
            type="search"
            value={text}
            placeholder="Notes, merchants, tags, categories or an amount"
            onChange={(e) => setText(e.target.value)}
            onBlur={() => { if (text.trim() !== (filters.q ?? "")) set("q", text.trim()); }}
          />
        </form>
        <div>
          <Label htmlFor="tx-type">Type</Label>
          <Select id="tx-type" value={filters.type ?? ""} onChange={(e) => set("type", e.target.value)}>
            <option value="">Any</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
            <option value="refund">Refund</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="tx-category">Category</Label>
          <Select id="tx-category" value={filters.category ?? ""} onChange={(e) => set("category", e.target.value)}>
            <option value="">Any</option>
            {categoryTree(categories).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </div>
        <Button variant="ghost" size="sm" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Fewer filters" : "More filters"}</Button>
        {active ? <Button variant="ghost" size="sm" onClick={() => { setText(""); go({}); }}>Clear</Button> : null}
      </div>

      {more ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="tx-from">From</Label>
            <Input id="tx-from" type="date" className="font-mono" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="tx-to">To</Label>
            <Input id="tx-to" type="date" className="font-mono" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value)} />
          </div>
          <div className="w-28">
            <Label htmlFor="tx-min">At least</Label>
            <Input id="tx-min" inputMode="decimal" className="font-mono" defaultValue={filters.min ?? ""} key={`min-${filters.min ?? ""}`} onBlur={(e) => { if (e.target.value.trim() !== (filters.min ?? "")) set("min", e.target.value.trim()); }} />
          </div>
          <div className="w-28">
            <Label htmlFor="tx-max">At most</Label>
            <Input id="tx-max" inputMode="decimal" className="font-mono" defaultValue={filters.max ?? ""} key={`max-${filters.max ?? ""}`} onBlur={(e) => { if (e.target.value.trim() !== (filters.max ?? "")) set("max", e.target.value.trim()); }} />
          </div>
          <div>
            <Label htmlFor="tx-clearing">Status</Label>
            <Select id="tx-clearing" value={filters.clearing ?? ""} onChange={(e) => set("clearing", e.target.value)}>
              <option value="">Any</option>
              <option value="pending">Pending</option>
              <option value="cleared">Cleared</option>
              <option value="reconciled">Reconciled</option>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="tx-view">Saved views</Label>
          <Select
            id="tx-view"
            value={current?.id ?? ""}
            onChange={(e) => {
              const view = views.data?.views.find((v) => v.id === e.target.value);
              setText(view?.filters.q ?? "");
              go(view?.filters ?? {});
            }}
          >
            <option value="">{active && !current ? "Unsaved search" : "All transactions"}</option>
            {(views.data?.views ?? []).map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
          </Select>
        </div>
        {current ? (
          <Button variant="ghost" size="sm" onClick={() => remove.mutate(current.id)}>Delete view</Button>
        ) : active ? (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (viewName.trim()) save.mutate(); }}>
            <div>
              <Label htmlFor="tx-view-name">Save this view as</Label>
              <Input id="tx-view-name" maxLength={60} value={viewName} placeholder="e.g. Big food spends" onChange={(e) => setViewName(e.target.value)} />
            </div>
            <Button type="submit" variant="ghost" size="sm" disabled={!viewName.trim() || save.isPending}>Save view</Button>
          </form>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error}</p> : null}
    </section>
  );
}
