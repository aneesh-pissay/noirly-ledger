"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { MoneyText } from "@/src/components/MoneyText";
import { ProgressBar } from "@/src/components/ProgressBar";
import { AccessibleChart } from "@/src/components/AccessibleChart";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  PageContainer,
  PageHeader,
  StatCell,
  StatGroup,
  Tabs,
} from "@noirly-dev/ui";
import { useUIStore } from "@/src/stores/ui-store";
import { useState } from "react";
import type { DateRangePreset } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  baseCurrency: string;
  displayName: string;
};

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: 8,
  color: "var(--foreground)",
};

const chartGridStroke = "var(--hairline)";
const chartAxisStroke = "var(--text-muted)";

const RANGES: { id: DateRangePreset; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "mtd", label: "Month to date" },
  { id: "fy", label: "Financial year" },
];

export function PersonalDashboard({ workspaceId, baseCurrency, displayName }: Props) {
  const [range, setRange] = useState<DateRangePreset>("mtd");
  const setOpen = useUIStore((s) => s.setTransactionComposerOpen);
  const dash = useQuery({
    queryKey: qk.dashboard(workspaceId, range),
    queryFn: () => api.dashboard(workspaceId, range),
  });
  const summary = dash.data?.summary;

  const { money: format, amount } = useMoneyFormat();
  const money = (minor: number) => format(minor, baseCurrency);
  const net = summary?.netMinor ?? 0;
  const budgets = summary?.budgets ?? [];

  return (
    <PageContainer size="lg">
      <PageHeader
        eyebrow={`Personal · ${RANGES.find((r) => r.id === range)?.label ?? ""}`}
        title={`Welcome, ${displayName}`}
        lead="Where your money went, and what is left of the month."
        action={<Button onClick={() => setOpen(true)}>Add transaction</Button>}
        toolbar={
          <Tabs
            aria-label="Date range"
            activeId={range}
            onSelect={(id) => setRange(id as DateRangePreset)}
            items={RANGES}
          />
        }
      />

      <StatGroup className="lg:grid-cols-3">
        <StatCell
          label="Income"
          value={money(summary?.incomeMinor ?? 0)}
          trend="up"
          caption="received in range"
        />
        <StatCell
          label="Spending"
          value={money(summary?.expenseMinor ?? 0)}
          trend="down"
          caption="spent in range"
        />
        <StatCell
          label="Net"
          value={money(net)}
          trend={net >= 0 ? "up" : "down"}
          caption={net >= 0 ? "ahead this period" : "behind this period"}
        />
      </StatGroup>

      <div className="grid gap-5 lg:grid-cols-2">
        <AccessibleChart
          title="Spending by category"
          summary={`${summary?.byCategory.length ?? 0} categories in range`}
          columns={[
            { key: "name", label: "Category" },
            { key: "amount", label: "Amount" },
          ]}
          rows={(summary?.byCategory ?? []).map((row) => ({
            name: row.name,
            amount: amount(row.amountMinor, baseCurrency),
          }))}
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={summary?.byCategory ?? []}
                dataKey="amountMinor"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
              >
                {(summary?.byCategory ?? []).map((row) => (
                  <Cell key={row.categoryId ?? row.name} fill={row.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </AccessibleChart>

        <AccessibleChart
          title="Spending over time"
          summary={`${summary?.range.from} → ${summary?.range.to}`}
          columns={[
            { key: "date", label: "Date" },
            { key: "expense", label: "Expense" },
            { key: "income", label: "Income" },
          ]}
          rows={(summary?.overTime ?? []).map((row) => ({
            date: row.date,
            expense: amount(row.expenseMinor, baseCurrency),
            income: amount(row.incomeMinor, baseCurrency),
          }))}
        >
          <ResponsiveContainer>
            <BarChart data={summary?.overTime ?? []}>
              <CartesianGrid stroke={chartGridStroke} vertical={false} />
              <XAxis dataKey="date" stroke={chartAxisStroke} fontSize={10} />
              <YAxis stroke={chartAxisStroke} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="expenseMinor" fill="var(--negative)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </AccessibleChart>
      </div>

      <AccessibleChart
        title="Net balance trend"
        summary="Income minus spending per day"
        columns={[
          { key: "date", label: "Date" },
          { key: "net", label: "Net" },
        ]}
        rows={(summary?.overTime ?? []).map((row) => ({
          date: row.date,
          net: amount(row.incomeMinor - row.expenseMinor, baseCurrency),
        }))}
      >
        <ResponsiveContainer>
          <LineChart
            data={(summary?.overTime ?? []).map((row) => ({
              date: row.date,
              net: row.incomeMinor - row.expenseMinor,
            }))}
          >
            <CartesianGrid stroke={chartGridStroke} vertical={false} />
            <XAxis dataKey="date" stroke={chartAxisStroke} fontSize={10} />
            <YAxis stroke={chartAxisStroke} fontSize={10} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="net" stroke="var(--accent)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </AccessibleChart>

      <Card>
        <CardHeader>
          <CardTitle>Budget health</CardTitle>
        </CardHeader>
        {budgets.length === 0 ? (
          <EmptyState
            title="No budgets yet"
            description="Set a monthly cap on a category and Ledger will track what is left of it."
          />
        ) : (
          <ul>
            {budgets.map((row) => {
              const ratio = row.budget.limitAmountMinor
                ? row.spentMinor / row.budget.limitAmountMinor
                : 0;
              const over = row.remainingMinor < 0;
              return (
                <li
                  key={row.budget.id}
                  className="flex flex-col gap-2 border-t border-[var(--hairline)] px-5 py-4"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[0.8125rem] font-medium capitalize">
                      {row.budget.period}
                    </span>
                    <MoneyText
                      amountMinor={row.remainingMinor}
                      currency={row.budget.currency}
                      tone={over ? "negative" : "positive"}
                      className="text-[0.8125rem]"
                    />
                  </div>
                  <ProgressBar value={ratio} tone={over ? "negative" : "accent"} />
                  <p className="meta">
                    {over ? "over budget" : `${Math.round((1 - ratio) * 100)}% left`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageContainer>
  );
}
