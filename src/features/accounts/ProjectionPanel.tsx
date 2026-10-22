"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, StatCell, StatGroup, Tabs } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { isLiability } from "@/src/core/accounts";
import { MoneyText } from "@/src/components/MoneyText";
import type { UpcomingItem } from "@/src/core/sync/types";

const WINDOWS = [
  { id: "30", label: "30 days" },
  { id: "60", label: "60 days" },
  { id: "90", label: "90 days" },
];
const SHOWN_UPCOMING = 12;

/** What's free to spend by the end of a window, where each account is heading, and what's coming. */
export function ProjectionPanel({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState(30);
  const query = useQuery({ queryKey: qk.projection(workspaceId, days), queryFn: () => api.getProjection(workspaceId, days) });
  const { money } = useMoneyFormat();
  const data = query.data?.projection;
  if (!data || !data.accounts.length) return null;
  const accountName = (id: string | null) => (id ? data.accounts.find((a) => a.id === id)?.name ?? "Archived account" : "No account");
  const where = (item: UpcomingItem) =>
    item.type === "transfer" ? `${accountName(item.accountId)} → ${accountName(item.toAccountId)}` : accountName(item.accountId);
  const signed = (item: UpcomingItem) => (item.type === "expense" ? -item.amountMinor : item.amountMinor);

  return (
    <section aria-label="Projections" className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Looking ahead</h2>
        <Tabs aria-label="Projection window" activeId={String(days)} onSelect={(id) => setDays(Number(id))} items={WINDOWS} />
      </div>
      <StatGroup className="lg:grid-cols-1">
        <StatCell
          label="Available to spend"
          value={money(data.availableToSpendMinor, data.baseCurrency)}
          trend={data.availableToSpendMinor >= 0 ? "up" : "down"}
          caption={`by ${data.through}: cash, bank and wallets once known income and bills land, less what you'll owe on cards`}
        />
      </StatGroup>
      {data.missingRates.length ? (
        <p role="note" className="text-sm text-[var(--muted-foreground)]">
          Left out until they have an FX rate to {data.baseCurrency}: {data.missingRates.join(", ")}.{" "}
          <Link href="/settings/currency" className="underline">Add rates</Link>
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Projected balances</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-[var(--hairline)]">
          {data.accounts.map((account) => {
            // A dip below zero before money comes in is the thing to warn about.
            const dips = !isLiability(account.kind) && account.lowestDate && account.lowestMinor < 0;
            return (
              <li key={account.id} data-projection={account.name} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{account.name}</span>
                <span className="text-[var(--muted-foreground)]">
                  today <MoneyText amountMinor={account.todayMinor} currency={account.currency} />
                </span>
                <span>
                  {data.through} <MoneyText amountMinor={account.projectedMinor} currency={account.currency} />
                  {isLiability(account.kind) ? <span className="text-[11px] text-[var(--muted-foreground)]"> owed</span> : null}
                </span>
                {dips ? (
                  <p role="note" className="w-full text-xs text-[var(--balance-negative)]">
                    Drops to {money(account.lowestMinor, account.currency)} on {account.lowestDate}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming up</CardTitle>
        </CardHeader>
        {data.upcoming.length ? (
          <ul aria-label="Coming up" className="divide-y divide-[var(--hairline)]">
            {data.upcoming.slice(0, SHOWN_UPCOMING).map((item, i) => (
              <li key={`${item.date}-${i}`} className="grid grid-cols-[6.5rem_1fr_auto] items-baseline gap-3 px-5 py-2 text-sm">
                <span className="font-mono tabular-nums text-[var(--muted-foreground)]">{item.date}</span>
                <span className="min-w-0 truncate">
                  {item.label || item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                  <span className="text-[var(--muted-foreground)]"> · {where(item)}{item.recurring ? " · repeats" : ""}</span>
                </span>
                <MoneyText
                  amountMinor={signed(item)}
                  currency={item.currency}
                  tone={item.type === "expense" ? "negative" : item.type === "transfer" ? "default" : "positive"}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-4 text-sm text-[var(--muted-foreground)]">Nothing scheduled in this window. Recurring transactions and future-dated ones show up here.</p>
        )}
        {data.upcoming.length > SHOWN_UPCOMING ? (
          <p className="px-5 pb-4 text-xs text-[var(--muted-foreground)]">And {data.upcoming.length - SHOWN_UPCOMING} more.</p>
        ) : null}
      </Card>
    </section>
  );
}
