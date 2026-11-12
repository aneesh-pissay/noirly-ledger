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
import { providerCovers } from "@/src/core/fx-provider";

type Props = { workspaceId: string; baseCurrency: string; fiscalYearStartMonth: number; autoFxRates: boolean };

export function CurrencyScreen({ workspaceId, baseCurrency, fiscalYearStartMonth, autoFxRates }: Props) {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState("EUR");
  const [rate, setRate] = useState("1.00");
  const [auto, setAuto] = useState(autoFxRates);
  const rates = useQuery({
    queryKey: qk.fxRates(workspaceId),
    queryFn: () => api.listFxRates(workspaceId),
  });
  const toggle = useMutation({
    mutationFn: (on: boolean) => api.updateWorkspaceSettings(workspaceId, { autoFxRates: on }),
    onSuccess: (result) => setAuto(Boolean(result.workspace?.autoFxRates)),
  });
  const refresh = useMutation({
    mutationFn: () => api.refreshFxRates(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.fxRates(workspaceId) }),
  });
  const covered = providerCovers(baseCurrency);

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
        <span className="font-mono text-[var(--foreground)]">{baseCurrency}</span>. A rate is how many {baseCurrency} 1.00 of
        the other currency is worth, from a day on. Set rates by hand, fetch them, or both: one set by hand always wins.
      </p>

      <section aria-label="Automatic rates" className="mt-6 space-y-2 surface grain rounded-[var(--r-lg)] p-4 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={auto} disabled={!covered || toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />
          <span>
            Fetch rates automatically
            <span className="block text-xs text-[var(--muted-foreground)]">
              {covered
                ? "Daily European Central Bank reference rates for the currencies you use, and the rate on the day for spending entered later (handy when travelling)."
                : `The rates provider doesn't cover ${baseCurrency}, so rates have to be set by hand.`}
            </span>
          </span>
        </label>
        {covered ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="ghost" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? "Fetching…" : "Refresh now"}
            </Button>
            {refresh.data ? (
              <span className="text-xs text-[var(--muted-foreground)]" role="status">
                {refresh.data.currencies.length ? `${refresh.data.kept} rate${refresh.data.kept === 1 ? "" : "s"} for ${refresh.data.date}: ${refresh.data.currencies.join(", ")}` : "No other currencies in use yet."}
              </span>
            ) : null}
            {refresh.error ? <span role="alert" className="text-xs text-[var(--balance-negative)]">{refresh.error.message}</span> : null}
          </div>
        ) : null}
        {toggle.error ? <p role="alert" className="text-xs text-[var(--balance-negative)]">{toggle.error.message}</p> : null}
      </section>
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
          <li key={row.id} data-rate={`${row.currency} ${row.effectiveFrom}`} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-mono">{row.currency}</span>
            <span className="font-mono tabular-nums text-[var(--muted-foreground)]">
              {formatScaledRate(row.rateToBaseScaled)} {baseCurrency} · {row.effectiveFrom} · {row.source === "auto" ? "fetched" : "user-set"}
            </span>
          </li>
        ))}
      </ul>
      {/* The personal workspace is always this person's own, so they can set its year. */}
      <NumbersSettings workspaceId={workspaceId} fiscalYearStartMonth={fiscalYearStartMonth} canManage />
    </PageContainer>
  );
}
