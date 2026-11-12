"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, CardHeader, CardTitle, EmptyState, StatCell, StatGroup, Tabs } from "@noirly-dev/ui";
import { api, type ReportRange } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { ProgressBar } from "@/src/components/ProgressBar";
import { dashboardRange, isoDate } from "@/src/core/budgets/period";
import { suggestedGranularity } from "@/src/core/reports/periods";
import { OTHERS, NO_MERCHANT, UNCATEGORIZED } from "@/src/core/reports/spending";
import {
  addWidget,
  drillHref,
  hiddenWidgets,
  moveWidget,
  removeWidget,
  resizeWidget,
  WIDGET_INFO,
  type Widget,
  type WidgetType,
} from "@/src/core/dashboard-widgets";
import { axisStroke, axisUnits, gridStroke, tooltipStyle } from "@/src/features/reports/report-ui";
import type { DateRangePreset } from "@/src/core/sync/types";

const RANGES: { id: DateRangePreset; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "mtd", label: "Month to date" },
  { id: "90d", label: "90 days" },
  { id: "fy", label: "Financial year" },
];

type Props = {
  workspaceId: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  /** Where its transactions are listed, for drilling down; null when the workspace has no such page. */
  transactionsHref: string | null;
};

type Ctx = { workspaceId: string; query: ReportRange; money: (minor: number) => string; drill: (f: { category?: string; merchant?: string; from?: string; to?: string }) => string | null };

function Frame({ title, children, href }: { title: string; children: ReactNode; href?: string | null }) {
  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-baseline justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {href ? <Link href={href} className="text-xs text-[var(--muted-foreground)] hover:underline">Open</Link> : null}
      </CardHeader>
      <div className="px-5 pb-5">{children}</div>
    </Card>
  );
}

const loading = <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>;

function SummaryWidget({ workspaceId, query, money }: Ctx) {
  const data = useQuery({ queryKey: ["transactions", workspaceId, "reports", "income-expense", query], queryFn: () => api.incomeExpenseReport(workspaceId, query) }).data;
  if (!data) return <Frame title="Summary">{loading}</Frame>;
  const t = data.totals;
  return (
    <StatGroup className="lg:grid-cols-4">
      <StatCell label="Income" value={money(t.incomeMinor)} trend="up" caption="received in range" />
      <StatCell label="Spending" value={money(t.expenseMinor)} trend="down" caption="net of refunds" />
      <StatCell label="Net" value={money(t.netMinor)} trend={t.netMinor >= 0 ? "up" : "down"} caption={t.netMinor >= 0 ? "ahead this range" : "behind this range"} />
      <StatCell label="Kept" value={t.savingsRatePct === null ? "—" : `${t.savingsRatePct}%`} caption="of income" />
    </StatGroup>
  );
}

function IncomeExpenseWidget({ workspaceId, query, money, drill }: Ctx) {
  const router = useRouter();
  const data = useQuery({ queryKey: ["transactions", workspaceId, "reports", "income-expense", query], queryFn: () => api.incomeExpenseReport(workspaceId, query) }).data;
  return (
    <Frame title="Income vs spending">
      {!data ? loading : (
        <div className="h-56" aria-label="Income vs spending by period">
          <ResponsiveContainer>
            <BarChart data={data.rows}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" stroke={axisStroke} fontSize={10} />
              <YAxis stroke={axisStroke} fontSize={10} tickFormatter={axisUnits} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
              {(["incomeMinor", "expenseMinor"] as const).map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={key === "incomeMinor" ? "Income" : "Spending"}
                  fill={key === "incomeMinor" ? "var(--balance-positive)" : "var(--balance-negative)"}
                  radius={4}
                  cursor={drill({}) ? "pointer" : undefined}
                  // A period's bar opens that period's transactions.
                  onClick={(entry: { payload?: { from: string; to: string } }) => {
                    const href = entry.payload ? drill({ from: entry.payload.from, to: entry.payload.to }) : null;
                    if (href) router.push(href);
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Frame>
  );
}

function CategoriesWidget({ workspaceId, query, money, drill }: Ctx) {
  const router = useRouter();
  const data = useQuery({ queryKey: ["transactions", workspaceId, "reports", "spending", query], queryFn: () => api.spendingReport(workspaceId, query) }).data;
  if (!data) return <Frame title="Spending by category">{loading}</Frame>;
  const rows = data.categories.filter((c) => c.amountMinor > 0).slice(0, 8);
  const open = (key: string) => (key === UNCATEGORIZED ? null : drill({ category: key }));
  return (
    <Frame title="Spending by category">
      {!rows.length ? <p className="text-sm text-[var(--muted-foreground)]">No spending in this range.</p> : (
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <div className="h-40" aria-hidden>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="amountMinor"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={70}
                  onClick={(entry: { payload?: { key: string } }) => {
                    const href = entry.payload ? open(entry.payload.key) : null;
                    if (href) router.push(href);
                  }}
                >
                  {rows.map((c) => <Cell key={c.key} fill={c.color} cursor={open(c.key) ? "pointer" : undefined} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul aria-label="Categories" className="space-y-1 text-sm">
            {rows.map((c) => {
              const href = open(c.key);
              const label = (
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />{c.name}</span>
                  <span className="font-mono text-xs tabular-nums">{money(c.amountMinor)} · {c.sharePct}%</span>
                </span>
              );
              return <li key={c.key} data-category={c.name}>{href ? <Link href={href} className="block hover:underline">{label}</Link> : label}</li>;
            })}
          </ul>
        </div>
      )}
    </Frame>
  );
}

function MerchantsWidget({ workspaceId, query, money, drill }: Ctx) {
  const data = useQuery({ queryKey: ["transactions", workspaceId, "reports", "spending", query], queryFn: () => api.spendingReport(workspaceId, query) }).data;
  if (!data) return <Frame title="Top merchants">{loading}</Frame>;
  const rows = data.merchants.filter((m) => m.key !== OTHERS && m.key !== NO_MERCHANT).slice(0, 6);
  return (
    <Frame title="Top merchants">
      {!rows.length ? <p className="text-sm text-[var(--muted-foreground)]">Add a merchant to an expense and it shows here.</p> : (
        <ul aria-label="Merchants" className="divide-y divide-[var(--hairline)] text-sm">
          {rows.map((m) => {
            const href = drill({ merchant: m.name });
            const label = (
              <span className="flex items-baseline justify-between gap-2 py-1.5">
                <span className="truncate">{m.name}</span>
                <span className="font-mono text-xs tabular-nums">{m.count} · {money(m.amountMinor)}</span>
              </span>
            );
            return <li key={m.key} data-merchant={m.name}>{href ? <Link href={href} className="block hover:underline">{label}</Link> : label}</li>;
          })}
        </ul>
      )}
    </Frame>
  );
}

function BudgetsWidget({ workspaceId, money, drill }: Ctx) {
  const summary = useQuery({ queryKey: qk.dashboard(workspaceId, "mtd"), queryFn: () => api.dashboard(workspaceId, "mtd") }).data?.summary;
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) }).data?.categories;
  if (!summary) return <Frame title="Budget health">{loading}</Frame>;
  const nameOf = (id: string) => categories?.find((c) => c.id === id)?.name ?? "Budget";
  return (
    <Frame title="Budget health">
      {!summary.budgets.length ? <EmptyState title="No budgets yet" description="Set a cap on a category and Ledger tracks what's left of it." /> : (
        <ul className="space-y-3">
          {summary.budgets.map((row) => {
            const ratio = row.availableMinor > 0 ? row.spentMinor / row.availableMinor : row.spentMinor > 0 ? 1 : 0;
            const over = row.remainingMinor < 0;
            const href = drill({ category: row.budget.categoryId, from: row.periodFrom, to: row.periodTo });
            const name = nameOf(row.budget.categoryId);
            return (
              <li key={row.budget.id} data-budget={name} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  {href ? <Link href={href} className="hover:underline">{name}</Link> : <span>{name}</span>}
                  <span className={`font-mono text-xs tabular-nums ${over ? "text-[var(--balance-negative)]" : ""}`}>
                    {over ? `${money(-row.remainingMinor)} over` : `${money(row.remainingMinor)} left`}
                  </span>
                </div>
                <ProgressBar value={ratio} tone={over ? "negative" : "accent"} />
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
}

function NetWorthWidget({ workspaceId, query, money }: Ctx) {
  const data = useQuery({ queryKey: ["accounts", workspaceId, "reports", "net-worth", query], queryFn: () => api.netWorthReport(workspaceId, query) }).data;
  if (!data) return <Frame title="Net worth">{loading}</Frame>;
  if (!data.hasAccounts) return <Frame title="Net worth"><p className="text-sm text-[var(--muted-foreground)]">Add accounts to follow your net worth.</p></Frame>;
  const nw = data.netWorth;
  return (
    <Frame title="Net worth">
      <p className="font-mono text-2xl tabular-nums" data-net-worth>{money(nw.end.netMinor)}</p>
      <p className={`text-xs ${nw.changeMinor >= 0 ? "text-[var(--balance-positive)]" : "text-[var(--balance-negative)]"}`}>
        {nw.changeMinor >= 0 ? "up" : "down"} {money(Math.abs(nw.changeMinor))} · {money(nw.end.assetsMinor)} have, {money(nw.end.liabilitiesMinor)} owed
      </p>
      <div className="mt-3 h-24" aria-hidden>
        <ResponsiveContainer>
          <LineChart data={nw.rows}>
            <Tooltip contentStyle={tooltipStyle} formatter={(value) => money(Number(value))} labelFormatter={(_, p) => (p?.[0]?.payload as { label?: string } | undefined)?.label ?? ""} />
            <Line type="monotone" dataKey="netMinor" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Frame>
  );
}

function CashFlowWidget({ workspaceId, query, money }: Ctx) {
  const data = useQuery({ queryKey: ["transactions", workspaceId, "reports", "cash-flow", query], queryFn: () => api.cashFlowReport(workspaceId, query) }).data;
  if (!data) return <Frame title="Money on hand">{loading}</Frame>;
  if (!data.hasCashAccounts) return <Frame title="Money on hand"><p className="text-sm text-[var(--muted-foreground)]">Add a cash, bank or wallet account to follow it.</p></Frame>;
  const t = data.totals;
  return (
    <Frame title="Money on hand">
      <p className="font-mono text-2xl tabular-nums">{money(t.closingMinor)}</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        <span className="text-[var(--balance-positive)]">{money(t.inMinor)} in</span> · <span className="text-[var(--balance-negative)]">{money(t.outMinor)} out</span> · from {money(t.openingMinor)}
      </p>
    </Frame>
  );
}

const WIDGETS: Record<WidgetType, (ctx: Ctx) => ReactNode> = {
  summary: SummaryWidget,
  "income-expense": IncomeExpenseWidget,
  categories: CategoriesWidget,
  merchants: MerchantsWidget,
  budgets: BudgetsWidget,
  "net-worth": NetWorthWidget,
  "cash-flow": CashFlowWidget,
};

/**
 * The dashboard: widgets each person chooses, orders and sizes for
 * themselves in this workspace (Customize), over a range. Categories,
 * merchants, budgets and periods open their transactions.
 */
export function WidgetDashboard({ workspaceId, baseCurrency, fiscalYearStartMonth, transactionsHref }: Props) {
  const queryClient = useQueryClient();
  const { money: format } = useMoneyFormat();
  const [range, setRange] = useState<DateRangePreset>("mtd");
  const [draft, setDraft] = useState<Widget[] | null>(null);
  const key = ["dashboard-layout", workspaceId] as const;
  const layout = useQuery({ queryKey: key, queryFn: () => api.dashboardLayout(workspaceId) });
  const save = useMutation({
    mutationFn: (widgets: Widget[] | null) => api.saveDashboardLayout(workspaceId, widgets),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      setDraft(null);
    },
  });

  const span = dashboardRange(range, new Date(), fiscalYearStartMonth);
  const from = isoDate(span.from);
  const to = isoDate(span.to);
  const query: ReportRange = { from, to, granularity: suggestedGranularity(from, to) };
  const ctx: Ctx = {
    workspaceId,
    query,
    money: (minor) => format(minor, baseCurrency),
    drill: (f) => drillHref(transactionsHref, { from, to, ...f }),
  };
  const editing = draft !== null;
  const widgets = draft ?? layout.data?.widgets ?? [];

  return (
    <section aria-label="Dashboard" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs aria-label="Date range" activeId={range} onSelect={(id) => setRange(id as DateRangePreset)} items={RANGES} />
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => save.mutate(null)} disabled={save.isPending}>Reset to default</Button>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>Save layout</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setDraft(widgets)} disabled={!layout.data}>Customize</Button>
        )}
      </div>

      {editing && hiddenWidgets(widgets).length ? (
        <div aria-label="Add a widget" role="group" className="flex flex-wrap gap-2 surface grain rounded-[var(--r-lg)] p-3 text-xs">
          <span className="self-center text-[var(--muted-foreground)]">Add:</span>
          {hiddenWidgets(widgets).map((type) => (
            <button key={type} type="button" title={WIDGET_INFO[type].description} className="rounded-md border border-[var(--hairline)] px-2 py-1 hover:border-[var(--accent)]" onClick={() => setDraft(addWidget(widgets, type))}>
              + {WIDGET_INFO[type].label}
            </button>
          ))}
        </div>
      ) : null}
      {save.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{save.error.message}</p> : null}

      {layout.data && !widgets.length ? <EmptyState title="Nothing on your dashboard" description="Customize it to add widgets." /> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {widgets.map((w, i) => {
          const Body = WIDGETS[w.type];
          return (
            <div key={w.type} data-widget={w.type} className={w.size === "full" ? "lg:col-span-2" : undefined}>
              {editing ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-[var(--accent)] px-3 py-1.5 text-xs">
                  <span className="font-medium">{WIDGET_INFO[w.type].label}</span>
                  <span className="flex gap-2 text-[var(--muted-foreground)]">
                    <button type="button" aria-label={`Move ${WIDGET_INFO[w.type].label} up`} disabled={i === 0} onClick={() => setDraft(moveWidget(widgets, i, -1))} className="disabled:opacity-40">↑</button>
                    <button type="button" aria-label={`Move ${WIDGET_INFO[w.type].label} down`} disabled={i === widgets.length - 1} onClick={() => setDraft(moveWidget(widgets, i, 1))} className="disabled:opacity-40">↓</button>
                    <button type="button" className="underline" onClick={() => setDraft(resizeWidget(widgets, w.type))}>{w.size === "half" ? "Full width" : "Half width"}</button>
                    <button type="button" className="underline hover:text-[var(--balance-negative)]" aria-label={`Remove ${WIDGET_INFO[w.type].label}`} onClick={() => setDraft(removeWidget(widgets, w.type))}>Remove</button>
                  </span>
                </div>
              ) : null}
              <Body {...ctx} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
