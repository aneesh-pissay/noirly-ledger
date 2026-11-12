"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { drillHref } from "@/src/core/dashboard-widgets";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import { axisStroke, axisUnits, DownloadCsv, gridStroke, tooltipStyle, type ReportColumn } from "@/src/features/reports/report-ui";
import type { CategoryMover } from "@/src/core/reports/trends";

const COLUMNS: ReportColumn[] = [
  { key: "label", label: "Period" },
  { key: "incomeMinor", label: "Income", money: true },
  { key: "incomeChangePct", label: "Income change %" },
  { key: "expenseMinor", label: "Spending", money: true },
  { key: "spendingChangePct", label: "Spending change %" },
  { key: "spendingYearAgoMinor", label: "Spending a year earlier", money: true },
  { key: "spendingYearChangePct", label: "Change on a year earlier %" },
  { key: "netMinor", label: "Net", money: true },
  { key: "savingsRatePct", label: "Kept %" },
];

function Pct({ value, upIsBad = false }: { value: number | null; upIsBad?: boolean }) {
  if (value === null) return <span className="text-[var(--muted-foreground)]">—</span>;
  const bad = upIsBad ? value > 0 : value < 0;
  return <span className={value === 0 ? "" : bad ? "text-[var(--balance-negative)]" : "text-[var(--balance-positive)]"}>{value > 0 ? "+" : ""}{value}%</span>;
}

/**
 * Month-, quarter- or year-on-year: each period against the one before and
 * the same one a year earlier, spending smoothed over three periods, and
 * the categories moving most.
 */
export function TrendsView({ workspaceId, query, transactionsHref }: { workspaceId: string; query: ReportRange; transactionsHref: string | null }) {
  const router = useRouter();
  const report = useQuery({
    queryKey: ["transactions", workspaceId, "reports", "trends", query],
    queryFn: () => api.trendsReport(workspaceId, query),
  });
  const { money: format } = useMoneyFormat();
  const data = report.data;
  if (report.error) return <p role="alert" className="text-sm text-[var(--balance-negative)]">{report.error.message}</p>;
  if (!data) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  const money = (minor: number) => format(minor, data.baseCurrency);
  const hasYearAgo = data.rows.some((r) => r.spendingYearAgoMinor !== null);

  const movers = (title: string, list: CategoryMover[], label: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {list.length ? (
        <ul aria-label={title} className="divide-y divide-[var(--hairline)] px-5 pb-4 text-sm">
          {list.map((m) => (
            <li key={m.key} data-mover={m.name} className="flex items-baseline justify-between gap-3 py-2">
              <span>
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
                {m.name}
              </span>
              <span className="font-mono text-xs tabular-nums">
                {money(m.fromMinor)} → {money(m.toMinor)} <Pct value={m.changePct} upIsBad />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-4 text-sm text-[var(--muted-foreground)]">{label}</p>
      )}
    </Card>
  );

  return (
    <section aria-label="Trends" className="space-y-6">
      {data.granularity !== query.granularity ? (
        <p className="text-xs text-[var(--muted-foreground)]">Shown by month: weeks are too short to read a trend in.</p>
      ) : null}

      <AccessibleChart
        title="Spending over time"
        summary={`Spending each period, its three-period average${hasYearAgo ? ", and a year earlier" : ""}`}
        columns={[{ key: "label", label: "Period" }, { key: "spending", label: "Spending" }, { key: "average", label: "3-period average" }, { key: "ago", label: "A year earlier" }, { key: "income", label: "Income" }]}
        rows={data.rows.map((r) => ({
          label: r.label,
          spending: money(r.expenseMinor),
          average: r.spendingAverageMinor === null ? "—" : money(r.spendingAverageMinor),
          ago: r.spendingYearAgoMinor === null ? "—" : money(r.spendingYearAgoMinor),
          income: money(r.incomeMinor),
        }))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.rows}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" stroke={axisStroke} fontSize={10} />
            <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => (value == null ? "—" : money(Number(value)))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="expenseMinor"
              name="Spending"
              fill="var(--balance-negative)"
              radius={4}
              cursor={transactionsHref ? "pointer" : undefined}
              // A period's bar opens its transactions.
              onClick={(entry: { payload?: { from: string; to: string } }) => {
                const href = entry.payload ? drillHref(transactionsHref, { from: entry.payload.from, to: entry.payload.to }) : null;
                if (href) router.push(href);
              }}
            />
            <Line type="monotone" dataKey="spendingAverageMinor" name="3-period average" stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls />
            {hasYearAgo ? <Line type="monotone" dataKey="spendingYearAgoMinor" name="A year earlier" stroke="var(--text-muted)" strokeDasharray="4 4" dot={false} /> : null}
            <Line type="monotone" dataKey="incomeMinor" name="Income" stroke="var(--balance-positive)" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </AccessibleChart>

      <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
        <div className="flex justify-end px-3 pt-2">
          <DownloadCsv name={`trends-${query.from}_${query.to}`} columns={COLUMNS} rows={data.rows} currency={data.baseCurrency} />
        </div>
        <table aria-label="Trends by period" className="w-full text-sm">
          <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--hairline)]">
              <th className="px-4 py-2 text-left">Period</th>
              <th className="px-4 py-2 text-right">Income</th>
              <th className="px-4 py-2 text-right">Spending</th>
              <th className="px-4 py-2 text-right">vs before</th>
              {hasYearAgo ? <th className="px-4 py-2 text-right">vs a year earlier</th> : null}
              <th className="px-4 py-2 text-right">Net</th>
              <th className="px-4 py-2 text-right">Kept</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {data.rows.map((r) => (
              <tr key={r.key} data-period={r.label} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2 font-sans">
                  {r.label}
                  {r.inProgress ? <span className="ml-2 text-xs text-[var(--muted-foreground)]">so far</span> : null}
                </td>
                <td className="px-4 py-2 text-right">{money(r.incomeMinor)}</td>
                <td className="px-4 py-2 text-right">{money(r.expenseMinor)}</td>
                <td className="px-4 py-2 text-right"><Pct value={r.spendingChangePct} upIsBad /></td>
                {hasYearAgo ? <td className="px-4 py-2 text-right"><Pct value={r.spendingYearChangePct} upIsBad /></td> : null}
                <td className={`px-4 py-2 text-right ${r.netMinor < 0 ? "text-[var(--balance-negative)]" : ""}`}>{money(r.netMinor)}</td>
                <td className="px-4 py-2 text-right">{r.savingsRatePct === null ? "—" : `${r.savingsRatePct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.compared ? (
        <>
          <p className="text-sm text-[var(--muted-foreground)]">Categories moving most, {data.compared.from} to {data.compared.to}:</p>
          <div className="grid gap-5 lg:grid-cols-2">
            {movers("Spending more", data.risers, "Nothing went up.")}
            {movers("Spending less", data.fallers, "Nothing went down.")}
          </div>
          {data.rising.length ? (
            <p aria-label="Rising categories" className="text-sm">
              Rising period after period:{" "}
              {data.rising.map((r, i) => (
                <span key={r.key} data-rising={r.name}>
                  {i ? ", " : ""}
                  <strong>{r.name}</strong> ({r.streak} in a row)
                </span>
              ))}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">Pick a range with at least two finished periods to see which categories are moving.</p>
      )}
    </section>
  );
}
