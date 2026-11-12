"use client";

import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, StatCell, StatGroup } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import { axisStroke, axisUnits, DownloadCsv, gridStroke, tooltipStyle, type ReportColumn } from "@/src/features/reports/report-ui";

const COLUMNS: ReportColumn[] = [
  { key: "label", label: "Period" },
  { key: "openingMinor", label: "Opening", money: true },
  { key: "inMinor", label: "In", money: true },
  { key: "outMinor", label: "Out", money: true },
  { key: "otherMinor", label: "Other", money: true },
  { key: "closingMinor", label: "Closing", money: true },
];

/**
 * Money on hand (cash, bank and wallets) period by period. Moving money
 * between them isn't in or out; paying a card is out. "Other" is what else
 * changed the balance, like a new account or exchange rates.
 */
export function CashFlowView({ workspaceId, query }: { workspaceId: string; query: ReportRange }) {
  const report = useQuery({
    queryKey: ["transactions", workspaceId, "reports", "cash-flow", query],
    queryFn: () => api.cashFlowReport(workspaceId, query),
  });
  const { money: format } = useMoneyFormat();
  const data = report.data;
  if (report.error) return <p role="alert" className="text-sm text-[var(--balance-negative)]">{report.error.message}</p>;
  if (!data) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  if (!data.hasCashAccounts) {
    return <EmptyState title="No cash, bank or wallet accounts" description="Cash flow follows the money in your accounts. Add an account, then pick it on transactions." />;
  }
  const money = (minor: number) => format(minor, data.baseCurrency);
  const t = data.totals;
  const showOther = data.rows.some((r) => r.otherMinor !== 0);
  const columns = COLUMNS.filter((c) => c.key !== "otherMinor" || showOther);

  return (
    <section aria-label="Cash flow" className="space-y-6">
      <StatGroup>
        <StatCell label="At the start" value={money(t.openingMinor)} />
        <StatCell label="In" value={money(t.inMinor)} trend="up" />
        <StatCell label="Out" value={money(t.outMinor)} trend="down" />
        <StatCell label="At the end" value={money(t.closingMinor)} trend={t.closingMinor >= t.openingMinor ? "up" : "down"} caption={`${t.closingMinor >= t.openingMinor ? "up" : "down"} ${money(Math.abs(t.closingMinor - t.openingMinor))}`} />
      </StatGroup>

      <AccessibleChart
        title="Cash flow"
        summary="Money in and out of cash, bank and wallets, and what's left at the end of each period"
        columns={columns.map(({ key, label }) => ({ key, label }))}
        rows={data.rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, c.money ? money(r[c.key as keyof typeof r] as number) : String(r[c.key as keyof typeof r])])))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.rows.map((r) => ({ ...r, outNeg: -r.outMinor }))}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" stroke={axisStroke} fontSize={10} />
            <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Math.abs(Number(value)))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="inMinor" name="In" fill="var(--balance-positive)" radius={4} />
            <Bar dataKey="outNeg" name="Out" fill="var(--balance-negative)" radius={4} />
            <Line type="monotone" dataKey="closingMinor" name="On hand" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </AccessibleChart>

      <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
        <div className="flex justify-end px-3 pt-2">
          <DownloadCsv name={`cash-flow-${query.from}_${query.to}`} columns={COLUMNS} rows={data.rows} currency={data.baseCurrency} />
        </div>
        <table aria-label="Cash flow by period" className="w-full text-sm">
          <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--hairline)]">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2 ${c.key === "label" ? "text-left" : "text-right"}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {data.rows.map((r) => (
              <tr key={r.key} data-period={r.label} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2 font-sans">{r.label}</td>
                <td className="px-4 py-2 text-right">{money(r.openingMinor)}</td>
                <td className="px-4 py-2 text-right text-[var(--balance-positive)]">{money(r.inMinor)}</td>
                <td className="px-4 py-2 text-right text-[var(--balance-negative)]">{money(r.outMinor)}</td>
                {showOther ? <td className="px-4 py-2 text-right">{money(r.otherMinor)}</td> : null}
                <td className="px-4 py-2 text-right">{money(r.closingMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {showOther ? <p className="px-4 py-2 text-xs text-[var(--muted-foreground)]">Other: changes that aren&apos;t money in or out, like a new account&apos;s opening balance or exchange rates moving.</p> : null}
      </div>
    </section>
  );
}
