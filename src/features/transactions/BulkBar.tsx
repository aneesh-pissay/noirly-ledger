"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { parseTagInput } from "@/src/core/labels";
import { Select } from "@/src/components/Select";
import type { BulkChange } from "@/src/core/bulk";
import type { Category, Project } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  selectedIds: string[];
  categories: Category[];
  projects: Project[];
  onDone: () => void;
};

/** Actions for the selected transactions: set a category or project, add or remove tags, mark them, or delete them. */
export function BulkBar({ workspaceId, selectedIds, categories, projects, onDone }: Props) {
  const queryClient = useQueryClient();
  const [tags, setTags] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useMutation({
    mutationFn: (action: { kind: "delete" } | { kind: "update"; change: BulkChange }) => api.bulkChangeTransactions(workspaceId, { ids: selectedIds, action }),
    onMutate: () => setResult(null),
    onSuccess: ({ done, failed: misses }) => {
      setFailed(misses.length > 0);
      setResult(
        misses.length
          ? `Changed ${done}. ${misses.length} couldn't change: ${[...new Set(misses.map((m) => m.error))].join("; ")}`
          : `Changed ${done}.`,
      );
      setTags("");
      void queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["labels", workspaceId] });
      if (!misses.length) onDone();
    },
    onError: (err: Error) => { setFailed(true); setResult(err.message); },
  });
  const update = (change: BulkChange) => run.mutate({ kind: "update", change });

  return (
    <section aria-label="Selected transactions" className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-2 surface grain rounded-[var(--r-lg)] p-3">
      <p className="text-sm font-medium">{selectedIds.length} selected</p>
      <Select
        aria-label="Set category"
        className="h-8 w-44 text-xs"
        value=""
        disabled={run.isPending}
        onChange={(e) => { if (e.target.value) update({ categoryId: e.target.value === "none" ? null : e.target.value }); }}
      >
        <option value="">Set category…</option>
        <option value="none">Uncategorized</option>
        {categoryTree(categories).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </Select>
      {projects.length ? (
        <Select
          aria-label="Set project"
          className="h-8 w-40 text-xs"
          value=""
          disabled={run.isPending}
          onChange={(e) => { if (e.target.value) update({ projectId: e.target.value === "none" ? null : e.target.value }); }}
        >
          <option value="">Set project…</option>
          <option value="none">No project</option>
          {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      ) : null}
      <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (tags.trim()) update({ addTags: parseTagInput(tags) }); }}>
        {/* The shared Input fills its box, so the box sets the width. */}
        <div className="w-32">
          <Input aria-label="Tags to add or remove" className="h-8 text-xs" placeholder="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <Button type="submit" size="sm" variant="ghost" disabled={run.isPending || !tags.trim()}>Add tags</Button>
        <Button size="sm" variant="ghost" disabled={run.isPending || !tags.trim()} onClick={() => update({ removeTags: parseTagInput(tags) })}>Remove tags</Button>
      </form>
      <Button size="sm" variant="ghost" disabled={run.isPending} onClick={() => update({ clearing: "cleared" })}>Mark cleared</Button>
      <Button size="sm" variant="ghost" disabled={run.isPending} onClick={() => update({ clearing: "pending" })}>Mark pending</Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={run.isPending}
        onClick={() => { if (window.confirm(`Delete ${selectedIds.length} transaction${selectedIds.length === 1 ? "" : "s"}?`)) run.mutate({ kind: "delete" }); }}
      >
        Delete
      </Button>
      <button type="button" className="ml-auto text-xs text-[var(--muted-foreground)] underline" onClick={onDone}>Clear selection</button>
      {result ? (
        <p role="status" className={`w-full text-xs ${failed ? "text-[var(--balance-negative)]" : "text-[var(--balance-positive)]"}`}>{result}</p>
      ) : null}
    </section>
  );
}
