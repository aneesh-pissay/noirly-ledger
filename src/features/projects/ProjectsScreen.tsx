"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle, Input, Label, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import type { Project } from "@/src/core/sync/types";

type Props = { workspaceId: string; baseCurrency: string };

/** /projects — projects with what's been spent on each, plus the merchants and tags in use. */
export function ProjectsScreen({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId) });
  const merchants = useQuery({ queryKey: qk.merchants(workspaceId), queryFn: () => api.listMerchants(workspaceId) });
  const tags = useQuery({ queryKey: qk.tags(workspaceId), queryFn: () => api.listTags(workspaceId) });
  const [name, setName] = useState("");
  const [color, setColor] = useState("#C9A227");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.projects(workspaceId) });
  const { money: format } = useMoneyFormat();
  const money = (minor: number) => format(minor, baseCurrency);

  const create = useMutation({
    mutationFn: () => api.createProject(workspaceId, { name: name.trim(), color }),
    onMutate: () => setError(null),
    onSuccess: () => { setName(""); refresh(); },
    onError: (err: Error) => setError(err.message),
  });
  const change = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const list = projects.data?.projects ?? [];
  const row = (project: Project) => (
    <li key={project.id} data-project={project.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <Link href={`/transactions?project=${project.id}`} className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline">
          {project.transactionCount} transaction{project.transactionCount === 1 ? "" : "s"}
        </Link>
      </div>
      <div className="text-right font-mono text-sm tabular-nums">
        <p>{money(project.spentMinor)} <span className="text-[11px] text-[var(--muted-foreground)]">spent</span></p>
        {project.incomeMinor ? <p className="text-[11px] text-[var(--muted-foreground)]">{money(project.incomeMinor)} in</p> : null}
      </div>
      <div className="flex gap-2">
        <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]" disabled={change.isPending}
          onClick={() => change.mutate(() => api.updateProject(project.id, { archived: !project.archived }))}>
          {project.archived ? "Reopen" : "Archive"}
        </button>
        {project.transactionCount === 0 ? (
          <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]" disabled={change.isPending}
            aria-label={`Delete ${project.name}`}
            onClick={() => change.mutate(() => api.deleteProject(project.id))}>
            Delete
          </button>
        ) : null}
      </div>
    </li>
  );
  const open = list.filter((p) => !p.archived);
  const archived = list.filter((p) => p.archived);

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Group spending that crosses categories, like a trip or a renovation. Pick a project when you add a transaction.
      </p>

      <form
        className="mt-6 flex flex-col gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:flex-row sm:items-end"
        aria-label="New project"
        onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}
      >
        <div className="flex-1">
          <Label htmlFor="p-name">Name</Label>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Goa trip" required />
        </div>
        <div>
          <Label htmlFor="p-color">Color</Label>
          <Input id="p-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 p-1" />
        </div>
        <Button type="submit" disabled={create.isPending || !name.trim()}>{create.isPending ? "Adding…" : "Add project"}</Button>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}

      {projects.data && !list.length ? <p className="mt-6 text-sm text-[var(--muted-foreground)]">No projects yet.</p> : null}
      {open.length ? (
        <ul aria-label="Projects" className="mt-6 divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)]">{open.map(row)}</ul>
      ) : null}
      {archived.length ? (
        <section aria-label="Archived projects" className="mt-6 opacity-70">
          <h2 className="text-sm font-medium">Archived</h2>
          <ul className="mt-3 divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)]">{archived.map(row)}</ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Merchants</CardTitle>
          </CardHeader>
          {merchants.data?.merchants.length ? (
            <ul aria-label="Merchants" className="divide-y divide-[var(--hairline)]">
              {merchants.data.merchants.slice(0, 15).map((merchant) => (
                <li key={merchant.key} className="flex items-baseline justify-between gap-3 px-5 py-2 text-sm">
                  <Link href={`/transactions?merchant=${encodeURIComponent(merchant.name)}`} className="truncate hover:underline">{merchant.name}</Link>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--muted-foreground)]">
                    {merchant.count} · {money(merchant.spentMinor)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-4 text-sm text-[var(--muted-foreground)]">Add a merchant to a transaction and it shows up here.</p>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          {tags.data?.tags.length ? (
            <ul aria-label="Tags" className="flex flex-wrap gap-2 px-5 pb-4">
              {tags.data.tags.map((tag) => (
                <li key={tag.tag}>
                  <Link href={`/transactions?tag=${encodeURIComponent(tag.tag)}`} className="rounded-full border border-[var(--hairline)] px-2.5 py-1 font-mono text-xs hover:border-[var(--foreground)]">
                    #{tag.tag} <span className="text-[var(--muted-foreground)]">{tag.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-4 text-sm text-[var(--muted-foreground)]">Tag a transaction and it shows up here.</p>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
