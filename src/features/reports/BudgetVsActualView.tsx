"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, StatCell, StatGroup } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import { axisStroke, axisUnits, DownloadCsv, gridStroke, tooltipStyle, type ReportColumn } from "@/src/features/reports/report-ui";
import type { BudgetPeriodResult } from "@/src/core/reports/budget-vs-actual";

const PERIOD_LABEL: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly", custom: "Custom dates" };

const COLUMNS: ReportColumn[] = [
  { key: "name", label: "Budget" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "limitMinor", label: "Budgeted", money: true },
  { key: "spentMinor", label: "Spent", money: true },
  { key: "varianceMinor", label: "Left (or over)", money: true },
  { key: "usedPct", label: "Used %" },
  { key: "status", label: "Status" },
];

function StatusBadge({ p }: { p: BudgetPeriodResult }) {
  const tone = p.status === "over" ? "bg-[var(--balance-negative)]/15 text-[var(--balance-negative)]" : p.status === "near" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--balance-positive)]/15 text-[var(--balance-positive)]";
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${tone}`}>{p.status === "over" ? "Over" : p.status === "near" ? "Near" : "Under"}</span>;
}

/**
 * Each budget against what was actually spent, in the budget's own periods
 * that overlap the range, plus spending no budget covers.
 */
export function BudgetVsActualView({ workspaceId, query }: { workspaceId: string; query: ReportRange }) {
  const report = useQuery({
    queryKey: ["transactions", workspaceId, "reports", "budgets", query.from, query.to],
    queryFn: () => api.budgetVsActualReport(workspaceId, query),
  });
  const { money: format } = useMoneyFormat();
  const data = report.data;
  if (report.error) return <p role="alert" className="text-sm text-[var(--balance-negative)]">{report.error.message}</p>;
  if (!data) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  if (!data.budgets.length) {
    return <EmptyState title="No budgets in this range" description="Set a budget on a category and it's compared with what's spent here." />;
  }
  const money = (minor: number) => format(minor, data.baseCurrency);
  const s = data.summary;
  const left = (minor: number) => (minor >= 0 ? `${money(minor)} left` : `${money(-minor)} over`);

  return (
    <section aria-label="Budget vs actual" className="space-y-6">
      <StatGroup>
        <StatCell label="Budgeted" value={money(s.limitMinor)} caption={`${data.budgets.length} budget${data.budgets.length === 1 ? "" : "s"}, whole periods`} />
        <StatCell label="Spent" value={money(s.spentMinor)} trend={s.varianceMinor >= 0 ? "up" : "down"} caption={left(s.varianceMinor)} />
        <StatCell label="Over budget" value={String(s.overBudgets)} caption="budgets over in at least one period" />
        <StatCell label="Not budgeted" value={money(s.unbudgetedMinor)} caption="spent in categories without a budget" />
      </StatGroup>

      <AccessibleChart
        title="Budgeted vs spent"
        summary="Each budget's total over its periods in the range"
        columns={[{ key: "name", label: "Budget" }, { key: "budgeted", label: "Budgeted" }, { key: "spent", label: "Spent" }]}
        rows={data.budgets.map((b) => ({ name: b.name, budgeted: money(b.totals.limitMinor), spent: money(b.totals.spentMinor) }))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.budgets.map((b) => ({ name: b.name, limitMinor: b.totals.limitMinor, spentMinor: b.totals.spentMinor }))}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="name" stroke={axisStroke} fontSize={10} />
            <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="limitMinor" name="Budgeted" fill="var(--accent)" radius={4} />
            <Bar dataKey="spentMinor" name="Spent" fill="var(--balance-negative)" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </AccessibleChart>

      <div className="flex justify-end">
        <DownloadCsv
          name={`budget-vs-actual-${query.from}_${query.to}`}
          columns={COLUMNS}
          rows={data.budgets.flatMap((b) => b.periods.map((p) => ({ ...p, name: b.name })))}
          currency={data.baseCurrency}
        />
      </div>

      <ul className="space-y-4">
        {data.budgets.map((b) => (
          <li key={b.budgetId} data-budget={b.name} className="surface grain rounded-[var(--r-lg)] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {b.name}
                <span className="ml-2 font-mono text-[10px] uppercase text-[var(--muted-foreground)]">{PERIOD_LABEL[b.period]}</span>
              </p>
              <p className={`font-mono text-sm tabular-nums ${b.totals.varianceMinor < 0 ? "text-[var(--balance-negative)]" : ""}`}>
                {money(b.totals.spentMinor)} of {money(b.totals.limitMinor)} · {left(b.totals.varianceMinor)}
              </p>
            </div>
            <table aria-label={`${b.name} by period`} className="mt-3 w-full text-xs">
              <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-1 text-left">Period</th>
                  <th className="py-1 text-right">Budgeted</th>
                  <th className="py-1 text-right">Spent</th>
                  <th className="py-1 text-right">Left</th>
                  <th className="py-1 text-right">Used</th>
                  <th className="py-1 text-right" />
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {b.periods.map((p) => (
                  <tr key={p.from} data-period={p.from} className="border-t border-[var(--hairline)]">
                    <td className="py-1.5 font-sans">
                      {p.from} – {p.to}
                      {p.inProgress && p.paceMinor !== null ? (
                        <span className="ml-2 text-[var(--muted-foreground)]">
                          so far · {p.spentMinor > p.paceMinor ? `${money(p.spentMinor - p.paceMinor)} ahead of` : `${money(p.paceMinor - p.spentMinor)} behind`} an even pace
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right">{money(p.limitMinor)}</td>
                    <td className="py-1.5 text-right">{money(p.spentMinor)}</td>
                    <td className={`py-1.5 text-right ${p.varianceMinor < 0 ? "text-[var(--balance-negative)]" : ""}`}>{money(p.varianceMinor)}</td>
                    <td className="py-1.5 text-right">{p.usedPct === null ? "—" : `${p.usedPct}%`}</td>
                    <td className="py-1.5 text-right"><StatusBadge p={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--muted-foreground)]">Whole budget periods that overlap the range, each with the limit it had then. Carry-over from earlier periods isn&apos;t added.</p>
    </section>
  );
}
