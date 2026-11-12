"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, StatCell, StatGroup } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import { filtersToQuery } from "@/src/core/search";
import { NO_MERCHANT, OTHERS, UNCATEGORIZED, type BreakdownRow } from "@/src/core/reports/spending";
import { axisStroke, axisUnits, DownloadCsv, gridStroke, tooltipStyle, type ReportColumn } from "@/src/features/reports/report-ui";

const COLUMNS: ReportColumn[] = [
  { key: "name", label: "Name" },
  { key: "amountMinor", label: "Spent", money: true },
  { key: "sharePct", label: "Share %" },
  { key: "count", label: "Expenses" },
  { key: "averageMinor", label: "Average", money: true },
  { key: "previousMinor", label: "Before", money: true },
  { key: "changePct", label: "Change %" },
];

function Change({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[var(--muted-foreground)]">new</span>;
  // Spending going up is the warning colour.
  return <span className={pct > 0 ? "text-[var(--balance-negative)]" : pct < 0 ? "text-[var(--balance-positive)]" : ""}>{pct > 0 ? "+" : ""}{pct}%</span>;
}

/**
 * Where the money went: by category (subcategories underneath) and by
 * merchant, with each one's share and the change from the same number of
 * days before. Rows open the matching transactions when the workspace has them.
 */
export function SpendingView({ workspaceId, query, transactionsHref }: { workspaceId: string; query: ReportRange; transactionsHref: string | null }) {
  const report = useQuery({
    queryKey: ["transactions", workspaceId, "reports", "spending", query],
    queryFn: () => api.spendingReport(workspaceId, query),
  });
  const { money: format } = useMoneyFormat();
  const router = useRouter();
  const [open, setOpen] = useState<string[]>([]);
  const data = report.data;
  if (report.error) return <p role="alert" className="text-sm text-[var(--balance-negative)]">{report.error.message}</p>;
  if (!data) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  if (!data.categories.length) return <EmptyState title="No spending in this range" description="Pick a longer range, or add expenses." />;
  const money = (minor: number) => format(minor, data.baseCurrency);
  const link = (filters: { category?: string; merchant?: string }) =>
    transactionsHref ? `${transactionsHref}?${filtersToQuery({ ...filters, from: query.from, to: query.to })}` : null;

  const cells = (r: BreakdownRow) => (
    <>
      <td className="px-4 py-2 text-right">{money(r.amountMinor)}</td>
      <td className="px-4 py-2 text-right">{r.sharePct}%</td>
      <td className="px-4 py-2 text-right">{r.count}</td>
      <td className="px-4 py-2 text-right">{r.averageMinor === null ? "—" : money(r.averageMinor)}</td>
      <td className="px-4 py-2 text-right"><Change pct={r.changePct} /></td>
    </>
  );
  const header = (first: string) => (
    <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
      <tr className="border-b border-[var(--hairline)]">
        <th className="px-4 py-2 text-left">{first}</th>
        <th className="px-4 py-2 text-right">Spent</th>
        <th className="px-4 py-2 text-right">Share</th>
        <th className="px-4 py-2 text-right">Expenses</th>
        <th className="px-4 py-2 text-right">Average</th>
        <th className="px-4 py-2 text-right">vs before</th>
      </tr>
    </thead>
  );
  const name = (label: string, href: string | null) => (href ? <Link href={href} className="hover:underline">{label}</Link> : label);
  const top = data.categories[0]!;
  const chartRows = data.series.periods.map((label, i) => Object.fromEntries([["label", label], ...data.series.categories.map((c) => [c.key, c.values[i]])]));

  return (
    <section aria-label="Spending" className="space-y-6">
      <StatGroup>
        <StatCell label="Spent" value={money(data.totalMinor)} trend={data.changePct !== null && data.changePct > 0 ? "down" : "up"} caption={data.changePct === null ? "nothing in the days before" : `${data.changePct > 0 ? "+" : ""}${data.changePct}% on ${data.previous.from} to ${data.previous.to}`} />
        <StatCell label="Expenses" value={String(data.count)} caption={data.count ? `about ${money(Math.round(data.totalMinor / data.count))} each` : undefined} />
        <StatCell label="Biggest category" value={top.name} caption={`${top.sharePct}% · ${money(top.amountMinor)}`} />
      </StatGroup>

      <AccessibleChart
        title="By category"
        summary={`${data.categories.length} categories; ${top.name} is the biggest`}
        columns={[{ key: "name", label: "Category" }, { key: "spent", label: "Spent" }, { key: "share", label: "Share" }]}
        rows={data.categories.map((c) => ({ name: c.name, spent: money(c.amountMinor), share: `${c.sharePct}%` }))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.categories.slice(0, 10)} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid stroke={gridStroke} horizontal={false} />
            <XAxis type="number" stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
            <YAxis type="category" dataKey="name" stroke={axisStroke} fontSize={10} width={110} />
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
            <Bar
              dataKey="amountMinor"
              name="Spent"
              radius={4}
              // A category's bar opens its transactions.
              onClick={(entry: { payload?: { key: string } }) => {
                const href = entry.payload && entry.payload.key !== UNCATEGORIZED ? link({ category: entry.payload.key }) : null;
                if (href) router.push(href);
              }}
            >
              {data.categories.slice(0, 10).map((c) => <Cell key={c.key} fill={c.color} cursor={transactionsHref && c.key !== UNCATEGORIZED ? "pointer" : undefined} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </AccessibleChart>

      <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
        <div className="flex justify-end px-3 pt-2">
          <DownloadCsv name={`spending-by-category-${query.from}_${query.to}`} columns={COLUMNS} rows={data.categories.flatMap((c) => [c, ...c.children.map((ch) => ({ ...ch, name: `${c.name} › ${ch.name}` }))])} currency={data.baseCurrency} />
        </div>
        <table aria-label="Spending by category" className="w-full text-sm">
          {header("Category")}
          <tbody className="font-mono tabular-nums">
            {data.categories.map((c) => (
              <Fragment key={c.key}>
                <tr data-category={c.name} className="border-b border-[var(--hairline)]">
                  <td className="px-4 py-2 font-sans">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                    {name(c.name, c.key === UNCATEGORIZED ? null : link({ category: c.key }))}
                    {c.children.length ? (
                      <button type="button" aria-expanded={open.includes(c.key)} aria-label={`Show ${c.name} subcategories`} className="ml-2 text-xs text-[var(--muted-foreground)]" onClick={() => setOpen(open.includes(c.key) ? open.filter((k) => k !== c.key) : [...open, c.key])}>
                        {open.includes(c.key) ? "▾" : "▸"} {c.children.length}
                      </button>
                    ) : null}
                  </td>
                  {cells(c)}
                </tr>
                {open.includes(c.key)
                  ? c.children.map((ch) => (
                      <tr key={ch.key} data-subcategory={ch.name} className="border-b border-[var(--hairline)] text-[var(--muted-foreground)]">
                        <td className="py-2 pl-10 pr-4 font-sans">{name(ch.name, ch.key === c.key ? null : link({ category: ch.key }))}</td>
                        {cells(ch)}
                      </tr>
                    ))
                  : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {data.series.categories.length ? (
        <AccessibleChart
          title="Top categories over time"
          summary={`The ${data.series.categories.length} biggest categories, period by period`}
          columns={[{ key: "label", label: "Period" }, ...data.series.categories.map((c) => ({ key: c.key, label: c.name }))]}
          rows={chartRows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? money(v) : String(v)])))}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" stroke={axisStroke} fontSize={10} />
              <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.series.categories.map((c) => (
                <Bar key={c.key} dataKey={c.key} name={c.name} stackId="spend" fill={c.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </AccessibleChart>
      ) : null}

      <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
        <div className="flex justify-end px-3 pt-2">
          <DownloadCsv name={`spending-by-merchant-${query.from}_${query.to}`} columns={COLUMNS} rows={data.merchants} currency={data.baseCurrency} />
        </div>
        <table aria-label="Spending by merchant" className="w-full text-sm">
          {header("Merchant")}
          <tbody className="font-mono tabular-nums">
            {data.merchants.map((m) => (
              <tr key={m.key} data-merchant={m.name} className="border-b border-[var(--hairline)] last:border-0">
                <td className="px-4 py-2 font-sans">{name(m.name, m.key === OTHERS || m.key === NO_MERCHANT ? null : link({ merchant: m.name }))}</td>
                {cells(m)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
