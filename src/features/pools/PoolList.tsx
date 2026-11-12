"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { PoolMeter } from "@/src/features/pools/PoolMeter";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Input, Label, Textarea } from "@noirly-dev/ui";
import { POOL_TEMPLATE_INFO, POOL_TEMPLATES, type PoolTemplate } from "@/src/core/pool-templates";

type Props = {
  workspaceId: string;
  baseCurrency: string;
};

export function PoolList({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const canManage = useCan("pool.manage");
  const [name, setName] = useState("");
  const [limitMajor, setLimitMajor] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<PoolTemplate | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const needsDates = template ? POOL_TEMPLATE_INFO[template].needsDates : false;

  const poolsQuery = useQuery({
    queryKey: qk.budgetPools(workspaceId),
    queryFn: () => api.listPools(workspaceId),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createPool(workspaceId, {
        name,
        description: description || null,
        limitMajor,
        currency: baseCurrency,
        template,
        periodStart: needsDates ? periodStart || null : null,
        periodEnd: needsDates ? periodEnd || null : null,
      }),
    onSuccess: () => {
      setName("");
      setLimitMajor("");
      setDescription("");
      setTemplate(null);
      setPeriodStart("");
      setPeriodEnd("");
      // A template may have added categories.
      void queryClient.invalidateQueries({ queryKey: qk.categories(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: qk.budgetPools(workspaceId) });
    },
  });

  const pools = poolsQuery.data?.pools ?? [];

  return (
    <PageContainer size="md">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget pools</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Team spend posts to a pool only after approval.
          </p>
        </div>
        <Link
          href={`/w/${workspaceId}/expenses/new`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Submit expense
        </Link>
      </div>

      {canManage ? (
        <form
          className="mt-6 space-y-3 surface grain rounded-[var(--r-lg)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <p className="text-sm font-medium">New pool</p>
          <fieldset>
            <legend className="mb-2 text-xs text-[var(--muted-foreground)]">Start from</legend>
            <div className="grid gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Pool template">
              {([null, ...POOL_TEMPLATES] as const).map((t) => (
                <label
                  key={t ?? "blank"}
                  className={`cursor-pointer rounded-lg border p-2 text-xs ${template === t ? "border-[var(--accent)] text-[var(--foreground)]" : "border-[var(--hairline)] text-[var(--muted-foreground)]"}`}
                  title={t ? POOL_TEMPLATE_INFO[t].description : "No preset rules"}
                >
                  <input type="radio" name="pool-template" className="sr-only" checked={template === t} onChange={() => setTemplate(t)} aria-label={t ? POOL_TEMPLATE_INFO[t].label : "Blank"} />
                  <span className="block text-sm font-medium">{t ? POOL_TEMPLATE_INFO[t].label : "Blank"}</span>
                </label>
              ))}
            </div>
            {template ? <p className="mt-2 text-xs text-[var(--muted-foreground)]">{POOL_TEMPLATE_INFO[template].description} Adds {POOL_TEMPLATE_INFO[template].categories.map((c) => c.name).join(", ")} if missing. You can change any of it later.</p> : null}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pool-name">Name</Label>
              <Input
                id="pool-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="pool-limit">Limit ({baseCurrency})</Label>
              <Input
                id="pool-limit"
                inputMode="decimal"
                value={limitMajor}
                onChange={(e) => setLimitMajor(e.target.value)}
                placeholder="5000.00"
                required
              />
            </div>
          </div>
          {needsDates ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pool-start">From</Label>
                <Input id="pool-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pool-end">To</Label>
                <Input id="pool-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div>
            <Label htmlFor="pool-desc">Description</Label>
            <Textarea
              id="pool-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {create.isError ? (
            <p className="text-sm text-[var(--balance-negative)]" role="alert">
              {(create.error as Error).message}
            </p>
          ) : null}
          <Button type="submit" disabled={create.isPending || !name.trim() || !limitMajor}>
            {create.isPending ? "Creating…" : "Create pool"}
          </Button>
        </form>
      ) : null}

      <ul className="mt-6 grid gap-3">
        {pools.map((pool) => (
          <li key={pool.id}>
            <Link
              href={`/w/${workspaceId}/pools/${pool.id}`}
              className="block surface grain rounded-[var(--r-lg)] p-4 surface-interactive"
            >
              <p className="text-sm font-medium text-[var(--foreground)]">
                {pool.name}
                {pool.template ? <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">{POOL_TEMPLATE_INFO[pool.template].label}</span> : null}
                {pool.periodStart || pool.periodEnd ? <span className="ml-2 font-mono text-[10px] text-[var(--muted-foreground)]">{pool.periodStart ?? "…"} → {pool.periodEnd ?? "…"}</span> : null}
              </p>
              {pool.description ? (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{pool.description}</p>
              ) : null}
              <div className="mt-3">
                <PoolMeter pool={pool} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {poolsQuery.isLoading ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">Loading pools…</p>
      ) : null}
      {!poolsQuery.isLoading && pools.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--muted-foreground)]">No pools yet.</p>
      ) : null}
    </PageContainer>
  );
}
