"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { isoDate } from "@/src/core/budgets/period";
import { fiscalYear } from "@/src/core/locale-format";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Label } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";

type Props = {
  workspaceId: string;
  kind: "personal" | "team";
  /** Month (1–12) the workspace's financial year starts in, for the year shortcuts. */
  fiscalYearStartMonth?: number;
};

function monthStart(at = new Date()) {
  return isoDate(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)));
}

export function ReportBuilder({ workspaceId, kind, fiscalYearStartMonth = 1 }: Props) {
  const thisYear = fiscalYear(isoDate(new Date()), fiscalYearStartMonth);
  const lastYear = fiscalYear(isoDate(new Date()), fiscalYearStartMonth, -1);
  const [format, setFormat] = useState<"csv" | "pdf">("csv");
  const [template, setTemplate] = useState<"summary" | "pool" | "approvals">(
    kind === "team" ? "pool" : "summary",
  );
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDate(new Date()));
  const [budgetPoolId, setBudgetPoolId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pools = useQuery({
    queryKey: qk.budgetPools(workspaceId),
    queryFn: () => api.listPools(workspaceId),
    enabled: kind === "team",
  });

  async function onExport() {
    setPending(true);
    setError(null);
    try {
      const blob = await api.exportReport(workspaceId, {
        format,
        from,
        to,
        template,
        budgetPoolId: template === "pool" ? budgetPoolId || null : null,
      });
      const ext = format === "csv" ? "csv" : "pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ledger-${from}_${to}.${ext}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Export a period as CSV or PDF. Amounts are decimal strings with a currency code.
      </p>
      <form
        className="mt-6 space-y-4 surface grain rounded-[var(--r-lg)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onExport();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="from">From</Label>
            <input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <input
              id="to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {[
              { label: `This year (${thisYear.label})`, from: thisYear.from, to: isoDate(new Date()) },
              { label: `Last year (${lastYear.label})`, from: lastYear.from, to: lastYear.to },
            ].map((range) => (
              <Button key={range.label} type="button" variant="ghost" size="sm" onClick={() => { setFrom(range.from); setTo(range.to); }}>
                {range.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="template">Scope</Label>
            <Select
              id="template"
              value={template}
              onChange={(e) =>
                setTemplate(e.target.value as "summary" | "pool" | "approvals")
              }
            >
              <option value="summary">Workspace summary</option>
              {kind === "team" ? <option value="pool">Budget pool</option> : null}
              {kind === "team" ? (
                <option value="approvals">Approval audit</option>
              ) : null}
            </Select>
          </div>
          <div>
            <Label htmlFor="format">Format</Label>
            <Select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as "csv" | "pdf")}
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </Select>
          </div>
        </div>
        {template === "pool" ? (
          <div>
            <Label htmlFor="pool">Pool</Label>
            <Select
              id="pool"
              value={budgetPoolId}
              onChange={(e) => setBudgetPoolId(e.target.value)}
              required
            >
              <option value="">Select</option>
              {(pools.data?.pools ?? []).map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-[var(--balance-negative)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Exporting…" : "Export"}
        </Button>
      </form>
    </PageContainer>
  );
}
