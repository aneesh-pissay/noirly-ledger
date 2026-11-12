"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, CardHeader, CardTitle, Input, Label, PageContainer, StatCell, StatGroup, Tabs } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { forecast, forecastSummary, monthAfter, type ScenarioChange } from "@/src/core/forecast";
import { parseMajorToMinor } from "@/src/core/money";
import { formatGrouped, MONTH_NAMES } from "@/src/core/locale-format";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import { Select } from "@/src/components/Select";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { workspaceId: string };

const HORIZONS = [
  { id: "6", label: "6 months" },
  { id: "12", label: "12 months" },
  { id: "24", label: "24 months" },
];

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--hairline)", borderRadius: 8, color: "var(--foreground)" };

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]!.slice(0, 3)} ${year}`;
}

/** /forecast — where cash is heading month by month, and what changes would do to it. */
export function ForecastScreen({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const { money, format } = useMoneyFormat();
  const [basis, setBasis] = useState<"recent" | "budgets">("recent");
  const [months, setMonths] = useState(12);
  const [changes, setChanges] = useState<ScenarioChange[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [scenarioName, setScenarioName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const baseline = useQuery({ queryKey: qk.forecast(workspaceId, basis), queryFn: () => api.getForecastBaseline(workspaceId, basis) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const scenarios = useQuery({ queryKey: qk.scenarios(workspaceId), queryFn: () => api.listScenarios(workspaceId) });
  const data = baseline.data?.forecast;
  const categoryName = (id: string) => (id === "uncategorized" ? "Uncategorized" : categories.data?.categories.find((c) => c.id === id)?.name ?? "Category");
  const topLevel = (categories.data?.categories ?? []).filter((c) => !c.parentId && !(c.isSystem && (c.name === "Income" || c.name === "Transfer")));

  const rows = useMemo(() => {
    if (!data) return null;
    const base = forecast(data.baseline, [], months, data.today);
    const withChanges = forecast(data.baseline, changes, months, data.today);
    return { base, withChanges, baseSummary: forecastSummary(base, data.baseline.startCashMinor), summary: forecastSummary(withChanges, data.baseline.startCashMinor) };
  }, [data, changes, months]);

  const saveNew = useMutation({
    mutationFn: () => api.createScenario(workspaceId, { name: scenarioName.trim(), changes }),
    onMutate: () => { setError(null); setMessage(null); },
    onSuccess: ({ scenario }) => { setScenarioId(scenario.id); setMessage("Scenario saved."); void queryClient.invalidateQueries({ queryKey: qk.scenarios(workspaceId) }); },
    onError: (err: Error) => setError(err.message),
  });
  const saveExisting = useMutation({
    mutationFn: () => api.updateScenario(scenarioId, { name: scenarioName.trim(), changes }),
    onMutate: () => { setError(null); setMessage(null); },
    onSuccess: () => { setMessage("Scenario updated."); void queryClient.invalidateQueries({ queryKey: qk.scenarios(workspaceId) }); },
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteScenario(scenarioId),
    onSuccess: () => { setScenarioId(""); setScenarioName(""); setChanges([]); void queryClient.invalidateQueries({ queryKey: qk.scenarios(workspaceId) }); },
    onError: (err: Error) => setError(err.message),
  });

  const describe = (change: ScenarioChange) => {
    const when = (index: number | undefined) => (index && index > 1 && data ? ` from ${monthLabel(monthAfter(data.today, index))}` : "");
    const by = (c: { amountMinor?: number; pct?: number }) =>
      c.pct != null ? `${c.pct > 0 ? "+" : ""}${c.pct}%` : `${(c.amountMinor ?? 0) > 0 ? "+" : "−"}${money(Math.abs(c.amountMinor ?? 0), data?.baseCurrency ?? "")} a month`;
    if (change.kind === "income") return `Income ${by(change)}${when(change.fromMonth)}`;
    if (change.kind === "category") return `${categoryName(change.categoryId)} ${by(change)}${when(change.fromMonth)}`;
    const amount = `${change.amountMinor >= 0 ? "+" : "−"}${money(Math.abs(change.amountMinor), data?.baseCurrency ?? "")}`;
    const label = change.label ? `${change.label}: ` : "";
    if (change.kind === "one_off") return `${label}${amount} in ${data ? monthLabel(monthAfter(data.today, change.month)) : ""}`;
    return `${label}${amount} a month${when(change.fromMonth)}${change.months ? ` for ${change.months} months` : ""}`;
  };

  if (!data || !rows) {
    return (
      <PageContainer size="lg">
        <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">Loading the forecast…</p>
      </PageContainer>
    );
  }
  const currency = data.baseCurrency;
  const totalSpending = Object.values(data.baseline.spendingByCategory).reduce((sum, value) => sum + value, 0);

  return (
    <PageContainer size="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Where cash is heading from next month, if months go like {basis === "recent" ? `the last ${data.lookbackMonths} (${data.from} to ${data.to})` : "your budgets say (recent months where there's no budget)"}. Try changes to see what they&apos;d do.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Tabs aria-label="Typical month" activeId={basis} onSelect={(id) => setBasis(id as "recent" | "budgets")} items={[{ id: "recent", label: "Recent months" }, { id: "budgets", label: "Budgets" }]} />
          <Tabs aria-label="How far ahead" activeId={String(months)} onSelect={(id) => setMonths(Number(id))} items={HORIZONS} />
        </div>
      </div>

      <StatGroup className="mt-6 lg:grid-cols-3">
        <StatCell label="Cash today" value={money(data.baseline.startCashMinor, currency)} caption="cash, bank and wallets less card debt" />
        <StatCell
          label={`In ${months} months, as things are`}
          value={money(rows.baseSummary.endCashMinor, currency)}
          trend={rows.baseSummary.endCashMinor >= data.baseline.startCashMinor ? "up" : "down"}
          caption={`${money(data.baseline.monthlyIncomeMinor - totalSpending, currency)} a month`}
        />
        <StatCell
          label={`In ${months} months, with changes`}
          value={money(rows.summary.endCashMinor, currency)}
          trend={rows.summary.endCashMinor >= rows.baseSummary.endCashMinor ? "up" : "down"}
          caption={changes.length ? `${money(rows.summary.endCashMinor - rows.baseSummary.endCashMinor, currency)} against as things are` : "add a change below"}
        />
      </StatGroup>
      {rows.summary.firstNegativeMonth ? (
        <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">
          Cash would run out in {monthLabel(rows.summary.firstNegativeMonth)}, lowest at {money(rows.summary.lowest.cashMinor, currency)} in {monthLabel(rows.summary.lowest.month!)}.
        </p>
      ) : null}
      {data.missingRates.length ? <p role="note" className="mt-3 text-sm text-[var(--muted-foreground)]">Accounts in {data.missingRates.join(", ")} are left out until they have an FX rate.</p> : null}

      <div className="mt-6">
        <AccessibleChart
          title="Cash month by month"
          summary={`At the end of each month, in ${currency}`}
          columns={[
            { key: "month", label: "Month" },
            { key: "base", label: "As things are" },
            { key: "changed", label: "With changes" },
          ]}
          rows={rows.base.map((row, i) => ({
            month: monthLabel(row.month),
            base: formatGrouped(row.cashMinor, currency, format),
            changed: formatGrouped(rows.withChanges[i]!.cashMinor, currency, format),
          }))}
        >
          <ResponsiveContainer>
            <LineChart data={rows.base.map((row, i) => ({ month: monthLabel(row.month), base: row.cashMinor, changed: rows.withChanges[i]!.cashMinor }))}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={10} />
              <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(minor: number) => formatGrouped(Math.round(minor / 100), currency, format, 0)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(minor, name) => [money(Number(minor), currency), name === "base" ? "As things are" : "With changes"]} />
              <Legend formatter={(name) => (name === "base" ? "As things are" : "With changes")} />
              <Line type="linear" dataKey="base" stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="linear" dataKey="changed" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </AccessibleChart>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Changes to try</CardTitle>
          </CardHeader>
          <div className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1">
                <Label htmlFor="sc-load">Saved scenarios</Label>
                <Select
                  id="sc-load"
                  value={scenarioId}
                  onChange={(e) => {
                    const chosen = scenarios.data?.scenarios.find((s) => s.id === e.target.value);
                    setScenarioId(e.target.value);
                    setScenarioName(chosen?.name ?? "");
                    setChanges(chosen?.changes ?? []);
                    setMessage(null);
                  }}
                >
                  <option value="">New scenario</option>
                  {(scenarios.data?.scenarios ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              {scenarioId ? <Button size="sm" variant="ghost" onClick={() => remove.mutate()}>Delete</Button> : null}
            </div>

            {changes.length ? (
              <ul aria-label="Changes" className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
                {changes.map((change, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{describe(change)}</span>
                    <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]" aria-label={`Remove ${describe(change)}`} onClick={() => setChanges(changes.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">No changes yet. Add a raise, a cut, a big purchase or a new EMI.</p>
            )}

            <ChangeForm
              months={months}
              today={data.today}
              currency={currency}
              categories={topLevel.map((c) => ({ id: c.id, name: c.name }))}
              onAdd={(change) => { setChanges([...changes, change]); setMessage(null); }}
              onError={setError}
            />

            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!scenarioName.trim()) return;
                if (scenarioId) saveExisting.mutate();
                else saveNew.mutate();
              }}
            >
              <div className="min-w-[10rem] flex-1">
                <Label htmlFor="sc-name">Scenario name</Label>
                <Input id="sc-name" maxLength={80} value={scenarioName} placeholder="e.g. New car" onChange={(e) => setScenarioName(e.target.value)} />
              </div>
              <Button type="submit" variant="ghost" disabled={!scenarioName.trim() || saveNew.isPending || saveExisting.isPending}>
                {scenarioId ? "Update scenario" : "Save scenario"}
              </Button>
            </form>
            {message ? <p role="status" className="text-sm text-[var(--balance-positive)]">{message}</p> : null}
            {error ? <p className="text-sm text-[var(--balance-negative)]">{error}</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>A typical month</CardTitle>
          </CardHeader>
          <ul aria-label="Typical month" className="divide-y divide-[var(--hairline)] px-5 pb-4 text-sm">
            <li className="flex justify-between py-2">
              <span>Income</span>
              <span className="font-mono tabular-nums text-[var(--balance-positive)]">{money(data.baseline.monthlyIncomeMinor, currency)}</span>
            </li>
            {data.lines.map((line) => (
              <li key={line.categoryId} className="flex justify-between gap-3 py-2">
                <span>
                  {categoryName(line.categoryId)}
                  {line.source === "budget" ? <span className="ml-2 font-mono text-[10px] text-[var(--muted-foreground)]">BUDGET</span> : null}
                </span>
                <span className="font-mono tabular-nums">{money(line.monthlyMinor, currency)}</span>
              </li>
            ))}
            {!data.lines.length ? <li className="py-2 text-[var(--muted-foreground)]">No spending in those months.</li> : null}
          </ul>
        </Card>
      </div>
    </PageContainer>
  );
}

type ChangeFormProps = {
  months: number;
  today: string;
  currency: string;
  categories: Array<{ id: string; name: string }>;
  onAdd: (change: ScenarioChange) => void;
  onError: (message: string | null) => void;
};

/** Builds one change: what it is, by how much, and from when. */
function ChangeForm({ months, today, currency, categories, onAdd, onError }: ChangeFormProps) {
  const [kind, setKind] = useState<ScenarioChange["kind"]>("one_off");
  const [categoryId, setCategoryId] = useState("");
  const [by, setBy] = useState<"amount" | "pct">("amount");
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [value, setValue] = useState("");
  const [month, setMonth] = useState(1);
  const [count, setCount] = useState("");
  const [label, setLabel] = useState("");
  const monthOptions = Array.from({ length: months }, (_, i) => i + 1);
  const sign = direction === "in" ? 1 : -1;

  function submit() {
    onError(null);
    let minor: number | null = null;
    let pct: number | null = null;
    try {
      if (by === "pct" && (kind === "income" || kind === "category")) {
        pct = Number(value);
        if (!Number.isFinite(pct) || value.trim() === "") throw new Error();
      } else {
        minor = parseMajorToMinor(value.trim());
      }
    } catch {
      return onError(by === "pct" ? "Enter a percent, like 10 or -15" : "Enter an amount, like 5000 or -2500.50");
    }
    const amount = minor ?? 0;
    if (kind === "income") onAdd(pct != null ? { kind, pct, fromMonth: month } : { kind, amountMinor: amount, fromMonth: month });
    else if (kind === "category") {
      if (!categoryId) return onError("Pick a category");
      onAdd(pct != null ? { kind, categoryId, pct, fromMonth: month } : { kind, categoryId, amountMinor: amount, fromMonth: month });
    } else if (kind === "one_off") onAdd({ kind, amountMinor: sign * Math.abs(amount), month, label: label.trim() || undefined });
    else onAdd({ kind, amountMinor: sign * Math.abs(amount), fromMonth: month, months: count.trim() ? Number(count) : null, label: label.trim() || undefined });
    setValue("");
    setLabel("");
  }

  return (
    <form
      aria-label="Add a change"
      className="grid gap-3 rounded-xl border border-[var(--hairline)] p-3 sm:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
    >
      <div>
        <Label htmlFor="ch-kind">Change</Label>
        <Select id="ch-kind" value={kind} onChange={(e) => setKind(e.target.value as ScenarioChange["kind"])}>
          <option value="one_off">One-off amount</option>
          <option value="recurring">New monthly amount</option>
          <option value="income">Income up or down</option>
          <option value="category">Spending in a category</option>
        </Select>
      </div>
      {kind === "category" ? (
        <div>
          <Label htmlFor="ch-category">Category</Label>
          <Select id="ch-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      ) : kind === "income" ? (
        <div />
      ) : (
        <div>
          <Label htmlFor="ch-direction">Money</Label>
          <Select id="ch-direction" value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in")}>
            <option value="out">Going out</option>
            <option value="in">Coming in</option>
          </Select>
        </div>
      )}
      {kind === "income" || kind === "category" ? (
        <div>
          <Label htmlFor="ch-by">By</Label>
          <Select id="ch-by" value={by} onChange={(e) => setBy(e.target.value as "amount" | "pct")}>
            <option value="amount">An amount a month ({currency})</option>
            <option value="pct">A percent</option>
          </Select>
        </div>
      ) : null}
      <div>
        <Label htmlFor="ch-value">{by === "pct" && (kind === "income" || kind === "category") ? "Percent (negative to cut)" : kind === "income" || kind === "category" ? `Amount (${currency}, negative to cut)` : `Amount (${currency})`}</Label>
        <Input id="ch-value" inputMode="decimal" className="font-mono" value={value} onChange={(e) => setValue(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="ch-month">{kind === "one_off" ? "In" : "From"}</Label>
        <Select id="ch-month" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))}>
          {monthOptions.map((i) => <option key={i} value={i}>{monthLabel(monthAfter(today, i))}</option>)}
        </Select>
      </div>
      {kind === "recurring" ? (
        <div>
          <Label htmlFor="ch-count">For how many months (empty for ongoing)</Label>
          <Input id="ch-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
        </div>
      ) : null}
      {kind === "one_off" || kind === "recurring" ? (
        <div>
          <Label htmlFor="ch-label">What it is (optional)</Label>
          <Input id="ch-label" maxLength={80} value={label} placeholder="e.g. Car EMI" onChange={(e) => setLabel(e.target.value)} />
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" variant="ghost">Add change</Button>
      </div>
    </form>
  );
}
