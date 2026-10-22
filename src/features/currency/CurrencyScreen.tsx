"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { COMMON_CURRENCIES, formatScaledRate } from "@/src/core/money";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Input, Label } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";
import { isoDate } from "@/src/core/budgets/period";
import { NumbersSettings } from "@/src/features/currency/NumbersSettings";

type Props = { workspaceId: string; baseCurrency: string; fiscalYearStartMonth: number };

export function CurrencyScreen({ workspaceId, baseCurrency, fiscalYearStartMonth }: Props) {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("EUR");
  const [rate, setRate] = useState("1.00");
  const rates = useQuery({
    queryKey: qk.fxRates(workspaceId),
    queryFn: () => api.listFxRates(workspaceId),
  });

  const save = useMutation({
    mutationFn: () =>
      api.upsertFxRate(workspaceId, {
        currency,
        rate,
        effectiveFrom: isoDate(new Date()),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.fxRates(workspaceId) }),
  });

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Currency</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Base currency is{" "}
        <span className="font-mono text-[var(--foreground)]">{baseCurrency}</span>. Rates are
        user-set (how many {baseCurrency} per 1.00 of the quote currency). No live FX feed.
      </p>
      <form
        className="mt-6 grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-3 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <Label htmlFor="fx-cur">Quote currency</Label>
          <Select id="fx-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {COMMON_CURRENCIES.filter((code) => code !== baseCurrency).map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="fx-rate">Rate to {baseCurrency}</Label>
          <Input
            id="fx-rate"
            className="font-mono"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={save.isPending}>
          Save rate
        </Button>
      </form>
      <ul className="mt-6 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
        {(rates.data?.rates ?? []).map((row) => (
          <li key={row.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-mono">{row.currency}</span>
            <span className="font-mono tabular-nums text-[var(--muted-foreground)]">
              {formatScaledRate(row.rateToBaseScaled)} {baseCurrency} · {row.effectiveFrom}
            </span>
          </li>
        ))}
      </ul>
      {/* The personal workspace is always this person's own, so they can set its year. */}
      <NumbersSettings workspaceId={workspaceId} fiscalYearStartMonth={fiscalYearStartMonth} canManage />
    </PageContainer>
  );
}
