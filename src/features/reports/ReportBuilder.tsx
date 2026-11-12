"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { Button } from "@noirly-dev/ui";
import { Label } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";

type Props = {
  workspaceId: string;
  kind: "personal" | "team";
  /** The range chosen on the reports page. */
  from: string;
  to: string;
};

/** The Export tab: the range's transactions as CSV, or a summary PDF. */
export function ReportBuilder({ workspaceId, kind, from, to }: Props) {
  const [format, setFormat] = useState<"csv" | "pdf" | "xlsx">("csv");
  const [template, setTemplate] = useState<"summary" | "pool" | "approvals">(
    kind === "team" ? "pool" : "summary",
  );
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
      const ext = format;
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
    <form
      aria-label="Export"
      className="space-y-4 surface grain rounded-[var(--r-lg)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onExport();
      }}
    >
      <p className="text-sm text-[var(--muted-foreground)]">
        Every transaction from {from} to {to} as CSV or an Excel sheet, or a summary PDF. Amounts are decimal strings with a currency code.
      </p>
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
            onChange={(e) => setFormat(e.target.value as "csv" | "pdf" | "xlsx")}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (XLSX)</option>
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
  );
}
