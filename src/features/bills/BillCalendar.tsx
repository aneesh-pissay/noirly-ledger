"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { calendarWeeks, shiftMonth, type BillItem, type BillStatus } from "@/src/core/bills";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { workspaceId: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STATUS_LABEL: Record<BillStatus, string> = { paid: "Paid", due: "Due", upcoming: "Upcoming" };
const STATUS_TONE: Record<BillStatus, string> = {
  paid: "text-[var(--muted-foreground)]",
  due: "text-[var(--balance-negative)]",
  upcoming: "text-[var(--foreground)]",
};

function monthName(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** A month of bills and subscriptions, on a calendar and as a list, with what's paid and what's still to pay. */
export function BillCalendar({ workspaceId }: Props) {
  const { money } = useMoneyFormat();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const bills = useQuery({ queryKey: ["bills", workspaceId, month], queryFn: () => api.getBillCalendar(workspaceId, month) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const categoryLabels = new Map(categoryTree(categories.data?.categories ?? []).map((c) => [c.id, c.label]));
  const name = (item: BillItem) => item.merchant ?? item.note ?? (item.categoryId ? categoryLabels.get(item.categoryId) : undefined) ?? "Bill";
  const kind = (item: BillItem) => (item.source === "emi" ? "EMI" : item.source === "scheduled" ? "Scheduled" : item.frequency ? `Repeats ${item.frequency}` : "Recurring");

  const items = bills.data?.items ?? [];
  const today = bills.data?.today ?? "";
  const byDay = new Map<string, BillItem[]>();
  for (const item of items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Bills and subscriptions</CardTitle>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" aria-label="Previous month" className="rounded-full border border-[var(--hairline)] px-2.5 py-0.5" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <span aria-live="polite" className="min-w-[9rem] text-center font-medium">{monthName(month)}</span>
          <button type="button" aria-label="Next month" className="rounded-full border border-[var(--hairline)] px-2.5 py-0.5" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      </CardHeader>

      <div className="space-y-4 px-6 pb-6">
        <p data-bill-totals className="text-sm">
          {bills.data?.totals.length
            ? bills.data.totals.map((t) => `Paid ${money(t.paidMinor, t.currency)} · Still to pay ${money(t.toPayMinor, t.currency)}`).join("; ")
            : bills.isLoading ? "Loading…" : "No bills this month. Recurring expenses and EMIs show up here."}
        </p>

        {/* The calendar needs room; on a phone the list below says the same. */}
        <div className="hidden overflow-hidden rounded-xl border border-[var(--hairline)] sm:block" aria-hidden="true">
          <div className="grid grid-cols-7 border-b border-[var(--hairline)] bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
            {WEEKDAYS.map((d) => <span key={d} className="px-2 py-1.5">{d}</span>)}
          </div>
          {calendarWeeks(month).map((week, w) => (
            <div key={w} className="grid grid-cols-7 border-b border-[var(--hairline)] last:border-0">
              {week.map((day, d) => (
                <div key={d} className={`min-h-20 border-r border-[var(--hairline)] p-1.5 last:border-0 ${day ? "" : "bg-[var(--surface)] opacity-40"}`}>
                  {day ? (
                    <>
                      <span className={`font-mono text-xs tabular-nums ${day === today ? "rounded-full bg-[var(--foreground)] px-1.5 text-[var(--background)]" : "text-[var(--muted-foreground)]"}`}>
                        {Number(day.slice(8))}
                      </span>
                      <ul className="mt-1 space-y-0.5">
                        {(byDay.get(day) ?? []).map((item) => (
                          <li key={item.id} className={`truncate text-[11px] leading-4 ${STATUS_TONE[item.status]}`} title={`${name(item)} · ${money(item.amountMinor, item.currency)} · ${STATUS_LABEL[item.status]}`}>
                            {item.status === "paid" ? "✓ " : ""}{name(item)} <span className="font-mono tabular-nums">{money(item.amountMinor, item.currency)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        {items.length ? (
          <ul aria-label={`Bills in ${monthName(month)}`} className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {items.map((item) => (
              <li key={item.id} data-bill-date={item.date} data-bill-status={item.status} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)_9rem_7rem_5rem]">
                <span className="font-mono text-xs tabular-nums text-[var(--muted-foreground)]">{item.date}</span>
                <span className="truncate">{name(item)}</span>
                <span className="hidden truncate text-xs text-[var(--muted-foreground)] sm:block">{kind(item)}</span>
                <span className="text-right font-mono tabular-nums">{money(item.amountMinor, item.currency)}</span>
                <span className={`col-start-2 text-xs sm:col-start-auto sm:text-right ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
