"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { drillHref } from "@/src/core/dashboard-widgets";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatCell, StatGroup } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import { axisStroke, axisUnits, DownloadCsv, gridStroke, tooltipStyle, type ReportColumn } from "@/src/features/reports/report-ui";

const COLUMNS: ReportColumn[] = [
  { key: "label", label: "Period" },
  { key: "incomeMinor", label: "Income", money: true },
  { key: "expenseMinor", label: "Spending", money: true },
  { key: "netMinor", label: "Net", money: true },
  { key: "savingsRatePct", label: "Kept %" },
];

/** Income against spending (net of refunds), period by period, with what's left and the share kept. */
export function IncomeExpenseView({ workspaceId, query, transactionsHref }: { workspaceId: string; query: ReportRange; transactionsHref: string | null }) {
  const router = useRouter();
  // A period's bar opens that period's transactions.
  const openPeriod = (entry: { payload?: { from: string; to: string } }) => {
    const href = entry.payload ? drillHref(transactionsHref, { from: entry.payload.from, to: entry.payload.to }) : null;
    if (href) router.push(href);
  };
  const report = useQuery({
    queryKey: ["transactions", workspaceId, "reports", "income-expense", query],
    queryFn: () => api.incomeExpenseReport(workspaceId, query),
  });
  const { money: format } = useMoneyFormat();
  const data = report.data;
  if (report.error) return <p role="alert" className="text-sm text-[var(--balance-negative)]">{report.error.message}</p>;
  if (!data) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  const money = (minor: number) => format(minor, data.baseCurrency);
  const t = data.totals;

  return (
    <section aria-label="Income vs expense" className="space-y-6">
      <StatGroup>
        <StatCell label="Income" value={money(t.incomeMinor)} caption={`about ${money(data.averages.incomeMinor)} a period`} />
        <StatCell label="Spending" value={money(t.expenseMinor)} caption={`about ${money(data.averages.expenseMinor)} a period, net of refunds`} />
        <StatCell label="Net" value={money(t.netMinor)} trend={t.netMinor >= 0 ? "up" : "down"} caption="income less spending" />
        <StatCell label="Kept" value={t.savingsRatePct === null ? "—" : `${t.savingsRatePct}%`} caption="of income, not spent" />
      </StatGroup>

      <AccessibleChart
        title="Income vs expense"
        summary={`${data.rows.length} periods, ${data.rows[0]?.label ?? ""} to ${data.rows.at(-1)?.label ?? ""}`}
        columns={COLUMNS.map(({ key, label }) => ({ key, label }))}
        rows={data.rows.map((r) => ({ label: r.label, incomeMinor: money(r.incomeMinor), expenseMinor: money(r.expenseMinor), netMinor: money(r.netMinor), savingsRatePct: r.savingsRatePct === null ? "—" : `${r.savingsRatePct}%` }))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.rows}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" stroke={axisStroke} fontSize={10} />
            <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="incomeMinor" name="Income" fill="var(--balance-positive)" radius={4} cursor={transactionsHref ? "pointer" : undefined} onClick={openPeriod} />
            <Bar dataKey="expenseMinor" name="Spending" fill="var(--balance-negative)" radius={4} cursor={transactionsHref ? "pointer" : undefined} onClick={openPeriod} />
            <Line type="monotone" dataKey="netMinor" name="Net" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </AccessibleChart>

      <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
        <div className="flex justify-end px-3 pt-2">
          <DownloadCsv name={`income-vs-expense-${query.from}_${query.to}`} columns={COLUMNS} rows={data.rows} currency={data.baseCurrency} />
        </div>
        <table aria-label="Income vs expense by period" className="w-full text-sm">
          <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--hairline)]">
              {COLUMNS.map((c) => (
                <th key={c.key} className={`px-4 py-2 ${c.key === "label" ? "text-left" : "text-right"}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {data.rows.map((r) => (
              <tr key={r.key} data-period={r.label} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2 font-sans">
                  {(() => {
                    const href = drillHref(transactionsHref, { from: r.from, to: r.to });
                    return href ? <Link href={href} className="hover:underline">{r.label}</Link> : r.label;
                  })()}
                </td>
                <td className="px-4 py-2 text-right">{money(r.incomeMinor)}</td>
                <td className="px-4 py-2 text-right">{money(r.expenseMinor)}</td>
                <td className={`px-4 py-2 text-right ${r.netMinor < 0 ? "text-[var(--balance-negative)]" : ""}`}>{money(r.netMinor)}</td>
                <td className="px-4 py-2 text-right">{r.savingsRatePct === null ? "—" : `${r.savingsRatePct}%`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-mono tabular-nums">
            <tr className="border-t border-[var(--hairline)] font-semibold">
              <td className="px-4 py-2 font-sans">Total</td>
              <td className="px-4 py-2 text-right">{money(t.incomeMinor)}</td>
              <td className="px-4 py-2 text-right">{money(t.expenseMinor)}</td>
              <td className="px-4 py-2 text-right">{money(t.netMinor)}</td>
              <td className="px-4 py-2 text-right">{t.savingsRatePct === null ? "—" : `${t.savingsRatePct}%`}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
