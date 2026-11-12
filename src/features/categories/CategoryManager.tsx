"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { GST_RATES } from "@/src/core/gst";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Input, Label } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";

type Props = { workspaceId: string };

export function CategoryManager({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#52D3FE");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.categories(workspaceId) });

  const create = useMutation({
    mutationFn: () => api.createCategory(workspaceId, { name, color, icon: "circle", parentId: parentId || null }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setName("");
      void refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const setGst = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: string }) =>
      api.updateCategory(id, { defaultGst: rate === "" ? null : rate === "exempt" ? { ratePct: 0, treatment: "exempt", supply: "intra", itcEligible: false } : { ratePct: Number(rate), treatment: "taxable", supply: "intra", itcEligible: false } }),
    onMutate: () => setError(null),
    onSuccess: () => refresh(),
    onError: (err: Error) => setError(err.message),
  });
  const move = useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) => api.updateCategory(id, { parentId }),
    onMutate: () => setError(null),
    onSuccess: () => refresh(),
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => refresh(),
  });

  const tree = categoryTree(categories.data?.categories ?? []);
  const topLevel = tree.filter((category) => category.depth === 0);
  const hasChildren = (id: string) => tree.some((category) => category.depth === 1 && category.parentId === id);

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Put subcategories inside a category to split it up. A budget on a category covers its subcategories too.
      </p>
      <form
        className="mt-6 flex flex-col gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex-1">
          <Label htmlFor="cat-name">Name</Label>
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="cat-parent">Inside</Label>
          <Select id="cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Nothing (top level)</option>
            {topLevel.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cat-color">Color</Label>
          <Input
            id="cat-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 p-1"
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Add
        </Button>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}
      <ul className="mt-6 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
        {tree.map((category) => (
          <li
            key={category.id}
            data-category={category.label}
            className={`flex items-center justify-between gap-3 py-3 pr-4 ${category.depth ? "pl-10" : "pl-4"}`}
          >
            <span className="flex min-w-0 items-center gap-3 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
                aria-hidden
              />
              <span className="truncate">{category.name}</span>
              {category.isSystem ? (
                <span className="font-mono text-[10px] text-[var(--muted-foreground)]">SYSTEM</span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {/* GST that new transactions here start with. */}
              <Select
                aria-label={`GST for ${category.name}`}
                className="h-8 w-28 text-xs"
                value={category.defaultGst ? (category.defaultGst.treatment === "taxable" ? String(category.defaultGst.ratePct) : "exempt") : ""}
                disabled={setGst.isPending}
                onChange={(e) => setGst.mutate({ id: category.id, rate: e.target.value })}
              >
                <option value="">No GST</option>
                {GST_RATES.map((r) => <option key={r} value={r}>GST {r}%</option>)}
                <option value="exempt">Exempt</option>
              </Select>
              {/* One level deep: a category with subcategories stays at the top. */}
              {!hasChildren(category.id) ? (
                <Select
                  aria-label={`Move ${category.name}`}
                  className="h-8 text-xs"
                  value={category.depth ? category.parentId ?? "" : ""}
                  disabled={move.isPending}
                  onChange={(e) => move.mutate({ id: category.id, parentId: e.target.value || null })}
                >
                  <option value="">Top level</option>
                  {topLevel
                    .filter((parent) => parent.id !== category.id)
                    .map((parent) => (
                      <option key={parent.id} value={parent.id}>Inside {parent.name}</option>
                    ))}
                </Select>
              ) : null}
              <button
                type="button"
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]"
                onClick={() => remove.mutate(category.id)}
              >
                {category.isSystem ? "Archive" : "Delete"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
