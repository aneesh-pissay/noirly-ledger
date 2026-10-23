"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { workspaceId: string; from: string; to: string };

/** GST paid and collected over the report's dates, by rate, with what can be claimed back. */
export function GstSummaryCard({ workspaceId, from, to }: Props) {
  const { money } = useMoneyFormat();
  const summary = useQuery({
    queryKey: ["gst-summary", workspaceId, from, to],
    queryFn: () => api.getGstSummary(workspaceId, from, to),
    enabled: Boolean(from && to && from <= to),
  });
  const rows = summary.data?.summary ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST</CardTitle>
        <p className="meta mt-1">{from} to {to}</p>
      </CardHeader>
      <div className="space-y-4 px-5 pb-5 text-sm">
        {!rows.length ? <p className="text-[var(--muted-foreground)]">No transactions with GST in these dates.</p> : null}
        {rows.map((entry) => (
          <div key={entry.currency} data-gst-currency={entry.currency} className="space-y-2">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <dt className="text-[var(--muted-foreground)]">Paid on spending</dt>
              <dd className="font-mono tabular-nums">{money(entry.paid.taxMinor, entry.currency)}</dd>
              <dt className="text-[var(--muted-foreground)]">Collected on income</dt>
              <dd className="font-mono tabular-nums">{money(entry.collected.taxMinor, entry.currency)}</dd>
              <dt className="text-[var(--muted-foreground)]">Input tax credit</dt>
              <dd className="font-mono tabular-nums">{money(entry.itcMinor, entry.currency)}</dd>
              <dt className="text-[var(--muted-foreground)]">Taxable spending</dt>
              <dd className="font-mono tabular-nums">{money(entry.paid.taxableMinor, entry.currency)}</dd>
            </dl>
            <table className="w-full text-left text-xs">
              <thead className="text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-1 font-normal">Rate</th>
                  <th className="py-1 font-normal">Taxable</th>
                  <th className="py-1 font-normal">CGST</th>
                  <th className="py-1 font-normal">SGST</th>
                  <th className="py-1 font-normal">IGST</th>
                  <th className="py-1 font-normal">Collected</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {entry.byRate.map((rate) => (
                  <tr key={rate.ratePct} className="border-t border-[var(--hairline)]">
                    <td className="py-1">{rate.ratePct}%</td>
                    <td className="py-1">{money(rate.paid.taxableMinor, entry.currency)}</td>
                    <td className="py-1">{money(rate.paid.cgstMinor, entry.currency)}</td>
                    <td className="py-1">{money(rate.paid.sgstMinor, entry.currency)}</td>
                    <td className="py-1">{money(rate.paid.igstMinor, entry.currency)}</td>
                    <td className="py-1">{money(rate.collected.taxMinor, entry.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  );
}
