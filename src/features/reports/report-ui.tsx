"use client";

import { Button } from "@noirly-dev/ui";
import { reportCsv } from "@/src/core/reports/cash-flow-report";

export const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--hairline)",
  borderRadius: 8,
  color: "var(--foreground)",
};
export const gridStroke = "var(--hairline)";
export const axisStroke = "var(--text-muted)";

export type ReportColumn = { key: string; label: string; money?: boolean };

/** Saves a report's rows as a CSV file. */
export function DownloadCsv({ name, columns, rows, currency }: { name: string; columns: ReportColumn[]; rows: Array<Record<string, unknown>>; currency: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([reportCsv(columns, rows, currency)], { type: "text/csv" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${name}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }}
    >
      Download CSV
    </Button>
  );
}

/** Whole units for chart axes (minor units ÷ 100, rounded). */
export const axisUnits = (minor: number) => Math.round(minor / 100).toLocaleString();
