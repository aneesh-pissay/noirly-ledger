"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatCell, StatGroup } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { formatGrouped } from "@/src/core/locale-format";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { AccessibleChart } from "@/src/components/AccessibleChart";

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: 8,
  color: "var(--foreground)",
};

/** Assets, what's owed and net worth across all accounts in the base currency, with the last year's trend. */
export function NetWorthPanel({ workspaceId }: { workspaceId: string }) {
  const query = useQuery({ queryKey: qk.netWorth(workspaceId), queryFn: () => api.getNetWorth(workspaceId) });
  const { money: format, amount, format: numberFormat } = useMoneyFormat();
  const data = query.data?.netWorth;
  if (!data || !data.accounts.length) return null;
  const money = (minor: number) => format(minor, data.baseCurrency);
  // The chart runs from the first month any account was open.
  const history = data.history.slice(Math.max(0, data.history.findIndex((point) => point.assetsMinor || point.liabilitiesMinor)));

  return (
    <section aria-label="Net worth" className="mt-6 space-y-4">
      <StatGroup className="lg:grid-cols-3">
        <StatCell label="Assets" value={money(data.assetsMinor)} caption="cash, bank and wallets" />
        <StatCell label="Liabilities" value={money(data.liabilitiesMinor)} caption="owed on cards and loans" />
        <StatCell
          label="Net worth"
          value={money(data.netMinor)}
          trend={data.netMinor >= 0 ? "up" : "down"}
          caption="what you have minus what you owe"
        />
      </StatGroup>
      {data.missingRates.length ? (
        <p role="note" className="text-sm text-[var(--muted-foreground)]">
          Left out until they have an FX rate to {data.baseCurrency}: {data.missingRates.join(", ")}.{" "}
          <Link href="/settings/currency" className="underline">Add rates</Link>
        </p>
      ) : null}
      {history.length > 1 ? (
        <AccessibleChart
          title="Net worth over time"
          summary={`At the end of each month, and today, in ${data.baseCurrency}`}
          columns={[
            { key: "date", label: "Date" },
            { key: "assets", label: "Assets" },
            { key: "liabilities", label: "Liabilities" },
            { key: "net", label: "Net worth" },
          ]}
          rows={history.map((point) => ({
            date: point.date,
            assets: amount(point.assetsMinor, data.baseCurrency),
            liabilities: amount(point.liabilitiesMinor, data.baseCurrency),
            net: amount(point.netMinor, data.baseCurrency),
          }))}
        >
          <ResponsiveContainer>
            <LineChart data={history.map((point) => ({ date: point.date, net: point.netMinor }))}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} />
              <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(minor: number) => formatGrouped(Math.round(minor / 100) * 100, data.baseCurrency, numberFormat, 0)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(minor) => [money(Number(minor)), "Net worth"]} />
              <Line type="linear" dataKey="net" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </AccessibleChart>
      ) : null}
    </section>
  );
}
