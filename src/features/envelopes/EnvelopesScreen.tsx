"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label, PageContainer, StatCell, StatGroup } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { isoDate } from "@/src/core/budgets/period";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { Select } from "@/src/components/Select";

type Props = { workspaceId: string };

const READY = "";

/** /envelopes — share the money in your accounts out into envelopes, one per category. */
export function EnvelopesScreen({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const envelopes = useQuery({ queryKey: qk.envelopes(workspaceId), queryFn: () => api.getEnvelopes(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const [since, setSince] = useState(isoDate(new Date()));
  const [from, setFrom] = useState(READY);
  const [to, setTo] = useState(READY);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.envelopes(workspaceId) });

  const start = useMutation({
    mutationFn: () => api.startEnvelopes(workspaceId, since),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });
  const move = useMutation({
    mutationFn: () => api.moveEnvelopeMoney(workspaceId, { fromCategoryId: from || null, toCategoryId: to || null, amountMajor: amount.trim(), note: note.trim() || null }),
    onMutate: () => setError(null),
    onSuccess: () => { setAmount(""); setNote(""); void refresh(); },
    onError: (err: Error) => setError(err.message),
  });

  const state = envelopes.data?.envelopes;
  const name = (id: string | null) => (id ? categories.data?.categories.find((c) => c.id === id)?.name ?? "Envelope" : "Ready to assign");

  if (state && !state.started) {
    return (
      <PageContainer size="md">
        <h1 className="text-2xl font-semibold tracking-tight">Envelopes</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Share the money in your cash, bank and wallet accounts out into envelopes, one per category, and spend from them.
          Money without an envelope is Ready to assign; income adds to it, and card spending is kept back for the card.
        </p>
        <form className="mt-6 flex flex-wrap items-end gap-3 surface grain rounded-[var(--r-lg)] p-4" onSubmit={(e) => { e.preventDefault(); start.mutate(); }}>
          <div>
            <Label htmlFor="env-since">Count spending from</Label>
            <Input id="env-since" type="date" className="font-mono" value={since} onChange={(e) => setSince(e.target.value)} required />
          </div>
          <Button type="submit" disabled={start.isPending}>Start using envelopes</Button>
        </form>
        {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}
      </PageContainer>
    );
  }

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Envelopes</h1>
      {state ? (
        <>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Spending since {state.since} comes out of its category&apos;s envelope.</p>
          <StatGroup className="mt-6 lg:grid-cols-3">
            <StatCell
              label="Ready to assign"
              value={money(state.readyToAssignMinor, state.baseCurrency)}
              trend={state.readyToAssignMinor >= 0 ? "up" : "down"}
              caption={state.readyToAssignMinor < 0 ? "more is in envelopes than you have" : "money without an envelope yet"}
            />
            <StatCell label="In accounts" value={money(state.cashMinor, state.baseCurrency)} caption="cash, bank and wallets" />
            <StatCell label="Kept for cards" value={money(state.cardDebtMinor, state.baseCurrency)} caption="owed on credit cards" />
          </StatGroup>
          {state.missingRates.length ? (
            <p role="note" className="mt-3 text-sm text-[var(--muted-foreground)]">Accounts in {state.missingRates.join(", ")} are left out until they have an FX rate.</p>
          ) : null}

          <form
            aria-label="Move money"
            className="mt-6 grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-4 sm:items-end"
            onSubmit={(e) => { e.preventDefault(); if (amount.trim()) move.mutate(); }}
          >
            <div>
              <Label htmlFor="env-from">From</Label>
              <Select id="env-from" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value={READY}>Ready to assign</option>
                {state.envelopes.map((e) => <option key={e.categoryId} value={e.categoryId}>{name(e.categoryId)}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="env-to">To</Label>
              <Select id="env-to" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value={READY}>Ready to assign</option>
                {state.envelopes.map((e) => <option key={e.categoryId} value={e.categoryId}>{name(e.categoryId)}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="env-amount">Amount ({state.baseCurrency})</Label>
              <Input id="env-amount" inputMode="decimal" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <Button type="submit" disabled={move.isPending}>Move</Button>
            <div className="sm:col-span-4">
              <Label htmlFor="env-note">Note (optional)</Label>
              <Input id="env-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            </div>
          </form>
          {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}

          <ul aria-label="Envelopes" className="mt-6 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {state.envelopes.map((envelope) => (
              <li key={envelope.categoryId} data-envelope={name(envelope.categoryId)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name(envelope.categoryId)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {money(envelope.fundedMinor, state.baseCurrency)} in · {money(envelope.spentMinor, state.baseCurrency)} spent
                  </p>
                </div>
                <p className={`font-mono text-sm tabular-nums ${envelope.balanceMinor < 0 ? "text-[var(--balance-negative)]" : ""}`}>
                  {money(envelope.balanceMinor, state.baseCurrency)}
                </p>
                <button type="button" className="text-xs underline" onClick={() => { setFrom(READY); setTo(envelope.categoryId); }}>
                  Fill
                </button>
              </li>
            ))}
          </ul>
          {state.uncategorizedSpentMinor ? (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              {money(state.uncategorizedSpentMinor, state.baseCurrency)} spent without a category came out of Ready to assign.
            </p>
          ) : null}

          {envelopes.data?.moves.length ? (
            <section aria-label="Recent moves" className="mt-8">
              <h2 className="text-sm font-medium">Recent moves</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {envelopes.data.moves.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 text-[var(--muted-foreground)]">
                    <span className="truncate">{name(m.fromCategoryId)} → {name(m.toCategoryId)}{m.note ? ` · ${m.note}` : ""}</span>
                    <span className="shrink-0 font-mono tabular-nums">{money(m.amountMinor, state.baseCurrency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
