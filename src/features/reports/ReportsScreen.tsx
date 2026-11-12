"use client";

import { useState } from "react";
import { Button, PageContainer, Tabs } from "@noirly-dev/ui";
import { isoDate } from "@/src/core/budgets/period";
import { fiscalYear } from "@/src/core/locale-format";
import { GRANULARITIES, suggestedGranularity, type Granularity } from "@/src/core/reports/periods";
import { Select } from "@/src/components/Select";
import { GstSummaryCard } from "@/src/features/reports/GstSummaryCard";
import { ReportBuilder } from "@/src/features/reports/ReportBuilder";
import { IncomeExpenseView } from "@/src/features/reports/IncomeExpenseView";
import { CashFlowView } from "@/src/features/reports/CashFlowView";
import { SpendingView } from "@/src/features/reports/SpendingView";
import { BudgetVsActualView } from "@/src/features/reports/BudgetVsActualView";
import { TrendsView } from "@/src/features/reports/TrendsView";
import { NetWorthView } from "@/src/features/reports/NetWorthView";
import { ScheduledExports } from "@/src/features/reports/ScheduledExports";
import { InsightsView } from "@/src/features/reports/InsightsView";

type Props = {
  workspaceId: string;
  kind: "personal" | "team";
  baseCurrency: string;
  /** Month (1–12) the workspace's financial year starts in, for the year shortcuts and quarters. */
  fiscalYearStartMonth?: number;
  /** Where the workspace's transactions are listed, for links from report rows; null when it has no such page. */
  transactionsHref: string | null;
  currentUserId: string;
};

const TABS = [
  { id: "income", label: "Income vs expense" },
  { id: "spending", label: "Spending" },
  { id: "budgets", label: "Budget vs actual" },
  { id: "trends", label: "Trends" },
  { id: "insights", label: "Insights" },
  { id: "cash", label: "Cash flow" },
  { id: "net-worth", label: "Net worth & debt" },
  { id: "export", label: "Export" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const GRANULARITY_LABEL: Record<Granularity, string> = { week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };

function monthsBack(today: string, n: number) {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return isoDate(new Date(Date.UTC(y, m - 1 - n, 1)));
}

/** /reports: reports over a range, period by period, and exports. */
export function ReportsScreen({ workspaceId, kind, baseCurrency, fiscalYearStartMonth = 1, transactionsHref, currentUserId }: Props) {
  const today = isoDate(new Date());
  const thisYear = fiscalYear(today, fiscalYearStartMonth);
  const lastYear = fiscalYear(today, fiscalYearStartMonth, -1);
  const [tab, setTab] = useState<Tab>("income");
  const [from, setFrom] = useState(monthsBack(today, 5));
  const [to, setTo] = useState(today);
  const [granularity, setGranularity] = useState<Granularity | "auto">("auto");
  const effective = granularity === "auto" ? suggestedGranularity(from, to) : granularity;
  const query = { from, to, granularity: effective };

  const shortcuts = [
    { label: "This month", from: monthsBack(today, 0), to: today },
    { label: "Last 6 months", from: monthsBack(today, 5), to: today },
    { label: `This year (${thisYear.label})`, from: thisYear.from, to: today },
    { label: `Last year (${lastYear.label})`, from: lastYear.from, to: lastYear.to },
  ];

  return (
    <PageContainer size="lg">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">Amounts are in {baseCurrency}, posted transactions only.</p>

      <section aria-label="Report range" className="mt-6 flex flex-wrap items-end gap-3 surface grain rounded-[var(--r-lg)] p-4">
        <label className="text-xs text-[var(--muted-foreground)]">
          From
          <input aria-label="From" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-1 block rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)]" />
        </label>
        <label className="text-xs text-[var(--muted-foreground)]">
          To
          <input aria-label="To" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-1 block rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)]" />
        </label>
        <label className="text-xs text-[var(--muted-foreground)]">
          By
          <Select aria-label="Periods" value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity | "auto")} className="mt-1">
            <option value="auto">Auto ({GRANULARITY_LABEL[effective].toLowerCase()})</option>
            {GRANULARITIES.map((g) => (
              <option key={g} value={g}>{GRANULARITY_LABEL[g]}</option>
            ))}
          </Select>
        </label>
        <div className="flex flex-wrap gap-1">
          {shortcuts.map((s) => (
            <Button key={s.label} type="button" variant="ghost" size="sm" onClick={() => { setFrom(s.from); setTo(s.to); }}>
              {s.label}
            </Button>
          ))}
        </div>
      </section>

      <div className="mt-6">
        <Tabs aria-label="Report" activeId={tab} onSelect={(id) => setTab(id as Tab)} items={[...TABS]} />
      </div>
      <div className="mt-4 space-y-6">
        {tab === "income" ? <IncomeExpenseView workspaceId={workspaceId} query={query} transactionsHref={transactionsHref} /> : null}
        {tab === "spending" ? <SpendingView workspaceId={workspaceId} query={query} transactionsHref={transactionsHref} /> : null}
        {tab === "budgets" ? <BudgetVsActualView workspaceId={workspaceId} query={query} /> : null}
        {tab === "trends" ? <TrendsView workspaceId={workspaceId} query={query} transactionsHref={transactionsHref} /> : null}
        {tab === "insights" ? <InsightsView workspaceId={workspaceId} query={query} transactionsHref={transactionsHref} /> : null}
        {tab === "cash" ? <CashFlowView workspaceId={workspaceId} query={query} /> : null}
        {tab === "net-worth" ? <NetWorthView workspaceId={workspaceId} query={query} /> : null}
        {tab === "export" ? (
          <>
            <ReportBuilder workspaceId={workspaceId} kind={kind} from={from} to={to} />
            <ScheduledExports workspaceId={workspaceId} kind={kind} currentUserId={currentUserId} />
            <GstSummaryCard workspaceId={workspaceId} from={from} to={to} />
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
