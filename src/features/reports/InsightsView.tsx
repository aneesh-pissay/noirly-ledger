"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, StatCell, StatGroup } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { drillHref } from "@/src/core/dashboard-widgets";
import { UNCATEGORIZED } from "@/src/core/reports/spending";

/**
 * Rule-based insights over the range: what was unusually large, which
 * categories moved against the same number of days before, and what that
 * means for savings.
 */
export function InsightsView({ workspaceId, query, transactionsHref }: { workspaceId: string; query: ReportRange; transactionsHref: string | null }) {
  const report = useQuery({
    queryKey: ["transactions", workspaceId, "reports", "insights", query.from, query.to],
    queryFn: () => api.insightsReport(workspaceId, query),
  });
  const { money: format } = useMoneyFormat();
  const [allCategories, setAllCategories] = useState(false);
  const data = report.data;
  if (report.error) return <p role="alert" className="text-sm text-[var(--balance-negative)]">{report.error.message}</p>;
  if (!data) return <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;
  const money = (minor: number) => format(minor, data.baseCurrency);
  const s = data.savings;
  const earliest = data.compared.at(-1);
  const flagged = data.variances.filter((v) => v.flagged);
  const shown = allCategories ? data.variances : flagged;
  const rateCaption =
    s.usualSavingsRatePct === null || s.savingsRatePct === null
      ? "of income, not spent"
      : `usually ${s.usualSavingsRatePct}% (${s.savingsRatePct >= s.usualSavingsRatePct ? "+" : ""}${s.savingsRatePct - s.usualSavingsRatePct} points)`;

  return (
    <section aria-label="Insights" className="space-y-6">
      <p className="text-xs text-[var(--muted-foreground)]">
        Compared with the three stretches of the same length before{earliest ? `, back to ${earliest.from}` : ""}.
      </p>

      <StatGroup>
        <StatCell label="Kept" value={s.savingsRatePct === null ? "—" : `${s.savingsRatePct}%`} trend={s.netMinor >= 0 ? "up" : "down"} caption={rateCaption} />
        <StatCell label="Spending" value={money(s.expenseMinor)} trend={s.expenseMinor <= s.usualExpenseMinor ? "up" : "down"} caption={`usually ${money(s.usualExpenseMinor)}`} />
        <StatCell label="A year at this pace" value={money(s.yearlyAtThisPaceMinor)} caption={s.yearlyAtThisPaceMinor >= 0 ? "kept" : "short"} />
        <StatCell label="Could save" value={money(s.potentialMinor)} caption={s.potentialFrom.length ? `bringing ${s.potentialFrom.map((p) => p.name).join(", ")} back to usual` : "nothing's up on usual"} />
      </StatGroup>

      <Card>
        <CardHeader>
          <CardTitle>Unusual spending</CardTitle>
        </CardHeader>
        {data.unusual.length ? (
          <ul aria-label="Unusual spending" className="divide-y divide-[var(--hairline)] px-5 pb-4 text-sm">
            {data.unusual.map((u) => {
              const href = drillHref(transactionsHref, { from: u.date, to: u.date, ...(u.merchantName ? { merchant: u.merchantName } : u.categoryKey ? { category: u.categoryKey } : {}) });
              const title = u.note || u.merchantName || u.categoryName || "Expense";
              return (
                <li key={u.id} data-unusual={title} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    {href ? <Link href={href} className="hover:underline">{title}</Link> : title}
                    <span className="ml-2 text-xs text-[var(--muted-foreground)]">{u.date} · {u.reason}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[var(--balance-negative)]">{money(u.amountMinor)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 pb-4 text-sm text-[var(--muted-foreground)]">Nothing out of the ordinary.</p>
        )}
      </Card>

      <div className="overflow-x-auto surface grain rounded-[var(--r-lg)]">
        <div className="flex items-center justify-between px-4 pt-3">
          <h2 className="text-sm font-medium">Categories against usual</h2>
          <button type="button" className="text-xs text-[var(--muted-foreground)] underline" onClick={() => setAllCategories(!allCategories)}>
            {allCategories ? "Only what moved" : `All ${data.variances.length}`}
          </button>
        </div>
        {shown.length ? (
          <table aria-label="Category variance" className="w-full text-sm">
            <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
              <tr className="border-b border-[var(--hairline)]">
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Now</th>
                <th className="px-4 py-2 text-right">Usually</th>
                <th className="px-4 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {shown.map((v) => {
                const href = v.key === UNCATEGORIZED ? null : drillHref(transactionsHref, { category: v.key, from: query.from, to: query.to });
                return (
                  <tr key={v.key} data-variance={v.name} className="border-b border-[var(--hairline)] last:border-0">
                    <td className="px-4 py-2 font-sans">
                      {href ? <Link href={href} className="hover:underline">{v.name}</Link> : v.name}
                      {v.spike ? <span className="ml-2 rounded bg-[var(--balance-negative)]/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--balance-negative)]">spike</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right">{money(v.actualMinor)}</td>
                    <td className="px-4 py-2 text-right">{money(v.expectedMinor)}</td>
                    <td className={`px-4 py-2 text-right ${v.varianceMinor > 0 ? "text-[var(--balance-negative)]" : v.varianceMinor < 0 ? "text-[var(--balance-positive)]" : ""}`}>
                      {v.varianceMinor > 0 ? "+" : ""}{money(v.varianceMinor)}
                      {v.variancePct !== null ? ` (${v.variancePct > 0 ? "+" : ""}${v.variancePct}%)` : v.expectedMinor === 0 ? " (new)" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-3 text-sm text-[var(--muted-foreground)]">No category moved much from usual.</p>
        )}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Rules, not AI: an expense is unusual at more than three times its merchant&apos;s (or category&apos;s) usual amount; a category is flagged when it moves 25% or more and by a real amount.
      </p>
    </section>
  );
}
