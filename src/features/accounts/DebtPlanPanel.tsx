"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, Input } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { formatMinorToMajor } from "@/src/core/money";
import { DEBT_STRATEGIES, simulateDebts, type DebtPlanResult, type DebtStrategy, type DebtView } from "@/src/core/debts";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { workspaceId: string };

const STRATEGY_LABEL: Record<DebtStrategy, { name: string; how: string }> = {
  minimum: { name: "Minimums only", how: "Pay each debt's minimum and nothing more." },
  snowball: { name: "Snowball", how: "Extra goes to the smallest debt first: quick wins." },
  avalanche: { name: "Avalanche", how: "Extra goes to the highest rate first: the least interest." },
};

/** "Mar 2027": the month `months` from now. */
function monthFromNow(months: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1)).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

function duration(months: number) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} year${years === 1 ? "" : "s"}` : null, rest ? `${rest} month${rest === 1 ? "" : "s"}` : null].filter(Boolean).join(" ") || "under a month";
}

/** What's owed on loans and cards, and how fast it goes on minimums, snowball or avalanche, with any extra a month. */
export function DebtPlanPanel({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const query = useQuery({ queryKey: [...qk.accounts(workspaceId), "debts"], queryFn: () => api.listDebts(workspaceId) });
  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.saveDebtSettings>[1]) => api.saveDebtSettings(workspaceId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...qk.accounts(workspaceId), "debts"] }),
  });
  // Typed but not saved yet, so the comparison follows the box as it changes.
  const [extraDraft, setExtraDraft] = useState<string | null>(null);

  const data = query.data;
  const counted = useMemo(() => (data?.debts ?? []).filter((d) => !d.needsTerms), [data]);
  const extraMinor = (() => {
    const text = extraDraft ?? (data ? formatMinorToMajor(data.extraMonthlyMinor) : "0");
    const n = Number(text.replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  })();
  const results = useMemo(
    () => Object.fromEntries(DEBT_STRATEGIES.map((s) => [s, simulateDebts(counted, s, extraMinor)])) as Record<DebtStrategy, DebtPlanResult>,
    [counted, extraMinor],
  );
  if (!data || !data.debts.length) return null;
  const base = data.baseCurrency;
  const chosen = results[data.strategy];
  const minimum = results.minimum;

  const editable = (d: DebtView) => d.currency === base;
  const debtRow = (d: DebtView) => (
    <tr key={d.id} data-debt={d.name} className="border-t border-[var(--hairline)]">
      <td className="px-3 py-2">
        <span className="block">{d.name}</span>
        <span className="block text-[11px] text-[var(--muted-foreground)]">
          {d.kind === "card" ? "Card" : "Loan"}
          {d.fromSchedule ? " · from its schedule" : ""}
          {d.needsTerms ? " · add its rate and EMI to count it" : ""}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums">{money(d.balanceMinor, base)}</td>
      <td className="px-3 py-2 text-right">
        {editable(d) ? (
          <div className="ml-auto w-20">
            <Input
              key={`rate-${d.annualRatePct}`}
              aria-label={`Rate of ${d.name}`}
              className="text-right font-mono"
              inputMode="decimal"
              defaultValue={d.needsTerms && !d.annualRatePct ? "" : String(d.annualRatePct)}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== String(d.annualRatePct)) save.mutate({ debt: { accountId: d.id, annualRatePct: value === "" ? null : Number(value) } });
              }}
            />
          </div>
        ) : (
          <span className="font-mono tabular-nums">{d.annualRatePct}%</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {editable(d) ? (
          <div className="ml-auto w-28">
            <Input
              key={`min-${d.minimumMinor}`}
              aria-label={`Minimum of ${d.name}`}
              className="text-right font-mono"
              inputMode="decimal"
              defaultValue={d.minimumMinor ? formatMinorToMajor(d.minimumMinor) : ""}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value !== (d.minimumMinor ? formatMinorToMajor(d.minimumMinor) : "")) save.mutate({ debt: { accountId: d.id, minimumMajor: value === "" ? null : value } });
              }}
            />
          </div>
        ) : (
          <span className="font-mono tabular-nums">{money(d.minimumMinor, base)}</span>
        )}
      </td>
    </tr>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paying off debt</CardTitle>
        <p className="meta mt-1">
          {money(counted.reduce((s, d) => s + d.balanceMinor, 0), base)} owed across {counted.length} debt{counted.length === 1 ? "" : "s"}. Rates and minimums can be changed; cards start at the usual 42% a year and 5% minimum due.
        </p>
      </CardHeader>
      <div className="space-y-5 px-6 pb-6">
        <div className="overflow-x-auto rounded-xl border border-[var(--hairline)]">
          <table aria-label="Debts" className="w-full text-sm">
            <thead className="bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 text-left font-normal">Debt</th>
                <th className="px-3 py-2 text-right font-normal">Owed</th>
                <th className="px-3 py-2 text-right font-normal">Rate % a year</th>
                <th className="px-3 py-2 text-right font-normal">Minimum a month</th>
              </tr>
            </thead>
            <tbody>{data.debts.map(debtRow)}</tbody>
          </table>
        </div>

        <label className="flex flex-wrap items-center gap-3 text-sm">
          <span>Extra I can put toward debt each month ({base})</span>
          <span className="w-32">
            <Input
              aria-label="Extra each month"
              className="font-mono"
              inputMode="decimal"
              value={extraDraft ?? formatMinorToMajor(data.extraMonthlyMinor)}
              onChange={(e) => setExtraDraft(e.target.value)}
              onBlur={() => {
                if (extraDraft != null) save.mutate({ extraMonthlyMajor: (extraMinor / 100).toFixed(2) }, { onSuccess: () => setExtraDraft(null) });
              }}
            />
          </span>
        </label>

        <div role="radiogroup" aria-label="Payoff plan" className="grid gap-3 sm:grid-cols-3">
          {DEBT_STRATEGIES.map((s) => {
            const r = results[s];
            const picked = data.strategy === s;
            const saved = minimum.totalInterestMinor - r.totalInterestMinor;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={picked}
                data-strategy={s}
                onClick={() => save.mutate({ strategy: s })}
                className={`space-y-1 rounded-xl border p-3 text-left text-sm ${picked ? "border-[var(--accent)]" : "border-[var(--hairline)]"}`}
              >
                <span className="block font-medium">{STRATEGY_LABEL[s].name}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">{STRATEGY_LABEL[s].how}</span>
                <span className="block">{r.months == null ? "Never paid off: minimums don't cover the interest" : `Debt-free by ${monthFromNow(r.months)} (${duration(r.months)})`}</span>
                <span className="block font-mono text-xs tabular-nums">
                  Interest {money(r.totalInterestMinor, base)}
                  {s !== "minimum" && saved > 0 ? ` · saves ${money(saved, base)}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {chosen.payoffs.length ? (
          <div className="text-sm">
            <p className="font-medium">Order with {STRATEGY_LABEL[data.strategy].name.toLowerCase()}</p>
            <ol aria-label="Payoff order" className="mt-1 list-decimal space-y-0.5 pl-5">
              {chosen.payoffs.map((p) => (
                <li key={p.id}>
                  {p.name} <span className="text-[var(--muted-foreground)]">· paid off by {monthFromNow(p.month)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <OwedChart plan={chosen} minimum={minimum} currency={base} planName={STRATEGY_LABEL[data.strategy].name} startMinor={counted.reduce((s, d) => s + d.balanceMinor, 0)} />
        {data.missingRates.length ? <p role="note" className="text-xs text-[var(--muted-foreground)]">Left out until they have an FX rate to {base}: {data.missingRates.join(", ")}.</p> : null}
        {save.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{save.error.message}</p> : null}
      </div>
    </Card>
  );
}

/** What's owed month by month: the chosen plan against minimums only. */
function OwedChart({ plan, minimum, currency, planName, startMinor }: { plan: DebtPlanResult; minimum: DebtPlanResult; currency: string; planName: string; startMinor: number }) {
  const { money } = useMoneyFormat();
  const W = 600;
  const H = 140;
  const P = 6;
  // Both lines start from what's owed today, then each month's end.
  const planLine = [startMinor, ...plan.timeline];
  const minimumLine = [startMinor, ...minimum.timeline];
  const months = Math.max(minimumLine.length, planLine.length);
  const top = Math.max(1, ...minimumLine, ...planLine);
  if (!plan.timeline.length) return null;
  const x = (i: number) => P + (i / Math.max(1, months - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - v / top) * (H - 2 * P);
  const path = (t: number[]) => t.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const same = plan.strategy === "minimum";
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label={`Owed over time: ${planName} reaches nothing in ${plan.timeline.length} months${same ? "" : `, minimums only in ${minimum.timeline.length}`}`}>
        {!same ? <path d={path(minimumLine)} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /> : null}
        <path d={path(planLine)} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 text-xs text-[var(--muted-foreground)]">
        <span><span aria-hidden="true" className="mr-1 inline-block h-0.5 w-4 bg-[var(--accent)] align-middle" />{planName}</span>
        {!same ? <span><span aria-hidden="true" className="mr-1 inline-block w-4 border-t-2 border-dashed border-[var(--muted-foreground)] align-middle" />Minimums only</span> : null}
        <span>From {money(startMinor, currency)} owed today</span>
      </figcaption>
    </figure>
  );
}
