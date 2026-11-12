"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, StatCell, StatGroup } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import { ACCOUNT_KIND_LABEL } from "@/src/core/accounts";
import { axisStroke, axisUnits, DownloadCsv, gridStroke, tooltipStyle, type ReportColumn } from "@/src/features/reports/report-ui";

const NET_COLUMNS: ReportColumn[] = [
  { key: "label", label: "Period" },
  { key: "assetsMinor", label: "Assets", money: true },
  { key: "liabilitiesMinor", label: "Liabilities", money: true },
  { key: "netMinor", label: "Net worth", money: true },
  { key: "changeMinor", label: "Change", money: true },
];

const DEBT_COLUMNS: ReportColumn[] = [
  { key: "name", label: "Debt" },
  { key: "startMinor", label: "Owed at start", money: true },
  { key: "paidMinor", label: "Paid", money: true },
  { key: "chargedMinor", label: "Added", money: true },
  { key: "endMinor", label: "Owed at end", money: true },
  { key: "paidDownPct", label: "Paid down %" },
];

const STRATEGY_LABEL = { minimum: "minimums only", snowball: "snowball", avalanche: "avalanche" } as const;

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Net worth over the range, period by period, and which accounts moved it;
 * then debt: each card and loan's payments and new charges, the total owed
 * over time, and when the saved debt plan clears it.
 */
export function NetWorthView({ workspaceId, query }: { workspaceId: string; query: ReportRange }) {
  const report = useQuery({
    queryKey: ["accounts", workspaceId, "reports", "net-worth", query],
    queryFn: () => api.netWorthReport(workspaceId, query),
  });
  const { money: format } = useMoneyFormat();
  const data = report.data;
  if (report.error) return <p role="alert" className="text-sm text-[var(--balance-negative)]">{report.error.message}</p>;
  if (!data) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  if (!data.hasAccounts) return <EmptyState title="No accounts yet" description="Net worth is what's in your accounts less what you owe on cards and loans. Add an account to follow it." />;
  const money = (minor: number) => format(minor, data.baseCurrency);
  const nw = data.netWorth;
  const debt = data.debt;

  return (
    <section aria-label="Net worth and debt" className="space-y-6">
      <StatGroup>
        <StatCell label="Net worth" value={money(nw.end.netMinor)} trend={nw.changeMinor >= 0 ? "up" : "down"} caption={`${nw.changeMinor >= 0 ? "up" : "down"} ${money(Math.abs(nw.changeMinor))} over the range`} />
        <StatCell label="Owed" value={money(debt.totals.endMinor)} trend={debt.totals.changeMinor <= 0 ? "up" : "down"} caption={`${debt.totals.changeMinor <= 0 ? "down" : "up"} ${money(Math.abs(debt.totals.changeMinor))}; ${money(debt.totals.paidMinor)} paid, ${money(debt.totals.chargedMinor)} added`} />
        <StatCell
          label="Debt-free"
          value={data.plan ? (data.plan.debtFreeMonth ? monthLabel(data.plan.debtFreeMonth) : "Not at this pace") : debt.totals.endMinor ? "—" : "Already"}
          caption={data.plan ? `on the ${STRATEGY_LABEL[data.plan.strategy]} plan, ${money(data.plan.totalInterestMinor)} interest${data.plan.leftOut ? `; ${data.plan.leftOut} loan${data.plan.leftOut === 1 ? "" : "s"} without terms left out` : ""}` : "set rates and minimums on the debt plan"}
        />
      </StatGroup>

      <AccessibleChart
        title="Net worth"
        summary={`From ${money(nw.start.netMinor)} to ${money(nw.end.netMinor)}`}
        columns={NET_COLUMNS.map(({ key, label }) => ({ key, label }))}
        rows={nw.rows.map((r) => ({ label: r.label, assetsMinor: money(r.assetsMinor), liabilitiesMinor: money(r.liabilitiesMinor), netMinor: money(r.netMinor), changeMinor: money(r.changeMinor) }))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={nw.rows.map((r) => ({ ...r, owedNeg: -r.liabilitiesMinor }))}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="label" stroke={axisStroke} fontSize={10} />
            <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Math.abs(Number(value)))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="assetsMinor" name="Assets" fill="var(--balance-positive)" radius={4} />
            <Bar dataKey="owedNeg" name="Liabilities" fill="var(--balance-negative)" radius={4} />
            <Line type="monotone" dataKey="netMinor" name="Net worth" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </AccessibleChart>

      <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-sm font-medium">What moved it</h2>
          <DownloadCsv name={`net-worth-${query.from}_${query.to}`} columns={NET_COLUMNS} rows={nw.rows} currency={data.baseCurrency} />
        </div>
        {nw.movers.length ? (
          <table aria-label="Accounts by effect on net worth" className="w-full text-sm">
            <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
              <tr className="border-b border-[var(--hairline)]">
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-right">Start</th>
                <th className="px-4 py-2 text-right">End</th>
                <th className="px-4 py-2 text-right">Effect on net worth</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {nw.movers.map((m) => (
                <tr key={m.id} data-account={m.name} className="border-b border-[var(--hairline)] last:border-0">
                  <td className="px-4 py-2 font-sans">
                    {m.name} <span className="text-xs text-[var(--muted-foreground)]">{ACCOUNT_KIND_LABEL[m.kind]}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{money(m.startMinor)}</td>
                  <td className="px-4 py-2 text-right">{money(m.endMinor)}</td>
                  <td className={`px-4 py-2 text-right ${m.effectOnNetMinor < 0 ? "text-[var(--balance-negative)]" : "text-[var(--balance-positive)]"}`}>
                    {m.effectOnNetMinor > 0 ? "+" : ""}{money(m.effectOnNetMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-3 text-sm text-[var(--muted-foreground)]">No account changed over the range.</p>
        )}
      </div>

      {debt.debts.length ? (
        <>
          <AccessibleChart
            title="Debt over time"
            summary={`Owed on cards and loans: ${money(debt.totals.startMinor)} at the start, ${money(debt.totals.endMinor)} at the end`}
            columns={[{ key: "label", label: "Period" }, { key: "owed", label: "Owed" }]}
            rows={debt.rows.map((r) => ({ label: r.label, owed: money(r.owedMinor) }))}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={debt.rows}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis dataKey="label" stroke={axisStroke} fontSize={10} />
                <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
                <Area type="monotone" dataKey="owedMinor" name="Owed" stroke="var(--balance-negative)" fill="var(--balance-negative)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </AccessibleChart>

          <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
            <div className="flex items-center justify-between px-4 pt-3">
              <h2 className="text-sm font-medium">Debt progress</h2>
              <DownloadCsv name={`debt-progress-${query.from}_${query.to}`} columns={DEBT_COLUMNS} rows={debt.debts} currency={data.baseCurrency} />
            </div>
            <table aria-label="Debt progress" className="w-full text-sm">
              <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
                <tr className="border-b border-[var(--hairline)]">
                  <th className="px-4 py-2 text-left">Debt</th>
                  <th className="px-4 py-2 text-right">At start</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Added</th>
                  <th className="px-4 py-2 text-right">At end</th>
                  <th className="px-4 py-2 text-right">Paid down</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {debt.debts.map((d) => (
                  <tr key={d.id} data-debt={d.name} className="border-b border-[var(--hairline)] last:border-0">
                    <td className="px-4 py-2 font-sans">
                      {d.name} <span className="text-xs text-[var(--muted-foreground)]">{ACCOUNT_KIND_LABEL[d.kind]}</span>
                    </td>
                    <td className="px-4 py-2 text-right">{money(d.startMinor)}</td>
                    <td className="px-4 py-2 text-right text-[var(--balance-positive)]">{money(d.paidMinor)}</td>
                    <td className="px-4 py-2 text-right text-[var(--balance-negative)]">{money(d.chargedMinor)}</td>
                    <td className="px-4 py-2 text-right">{money(d.endMinor)}</td>
                    <td className="px-4 py-2 text-right">{d.paidDownPct === null ? "—" : `${d.paidDownPct}%`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-mono tabular-nums">
                <tr className="border-t border-[var(--hairline)] font-semibold">
                  <td className="px-4 py-2 font-sans">Total</td>
                  <td className="px-4 py-2 text-right">{money(debt.totals.startMinor)}</td>
                  <td className="px-4 py-2 text-right">{money(debt.totals.paidMinor)}</td>
                  <td className="px-4 py-2 text-right">{money(debt.totals.chargedMinor)}</td>
                  <td className="px-4 py-2 text-right">{money(debt.totals.endMinor)}</td>
                  <td className="px-4 py-2 text-right" />
                </tr>
              </tfoot>
            </table>
            <p className="px-4 py-2 text-xs text-[var(--muted-foreground)]">Paid is money into a card or loan; added is spending on it, interest and fees included.</p>
          </div>
        </>
      ) : null}
    </section>
  );
}
