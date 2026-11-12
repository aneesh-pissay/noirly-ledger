"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { Select } from "@/src/components/Select";
import { useNumberFormat } from "@/src/components/NumberFormatProvider";
import { fiscalYear, MONTH_NAMES, NUMBER_FORMATS, NUMBER_FORMAT_LABEL, type NumberFormat } from "@/src/core/locale-format";
import { isoDate } from "@/src/core/budgets/period";

type Props = { workspaceId: string; fiscalYearStartMonth: number; canManage: boolean };

/**
 * How amounts read (lakh/crore or thousands, a per-person choice) and when the
 * workspace's financial year starts. Each saves as soon as it's picked.
 */
export function NumbersSettings({ workspaceId, fiscalYearStartMonth, canManage }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<NumberFormat>(useNumberFormat());
  const [start, setStart] = useState(fiscalYearStartMonth);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const done = (message: string) => {
    setSaved(message);
    // The layout reads both settings on the server; refresh it and anything with dates or amounts.
    router.refresh();
    void queryClient.invalidateQueries();
  };

  const saveFormat = useMutation({
    mutationFn: (value: NumberFormat) => api.updateMe({ numberFormat: value }),
    onMutate: () => { setError(null); setSaved(null); },
    onSuccess: () => done("Number format saved."),
    onError: (err: Error) => setError(err.message),
  });
  const saveStart = useMutation({
    mutationFn: (month: number) => api.updateWorkspaceSettings(workspaceId, { fiscalYearStartMonth: month }),
    onMutate: () => { setError(null); setSaved(null); },
    onSuccess: () => done("Financial year saved."),
    onError: (err: Error) => setError(err.message),
  });
  const current = fiscalYear(isoDate(new Date()), start);

  return (
    <section aria-label="Numbers and financial year" className="mt-8 grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-2">
      <h2 className="text-sm font-medium sm:col-span-2">Numbers and financial year</h2>
      <div>
        <Label htmlFor="number-format">Group amounts in</Label>
        <Select
          id="number-format"
          value={format}
          disabled={saveFormat.isPending}
          onChange={(e) => {
            const value = e.target.value as NumberFormat;
            setFormat(value);
            saveFormat.mutate(value);
          }}
        >
          {NUMBER_FORMATS.map((value) => <option key={value} value={value}>{NUMBER_FORMAT_LABEL[value]}</option>)}
        </Select>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Just for you; others in the workspace keep their own.</p>
      </div>
      <div>
        <Label htmlFor="fy-start">Financial year starts in</Label>
        <Select
          id="fy-start"
          value={String(start)}
          disabled={!canManage || saveStart.isPending}
          onChange={(e) => {
            const month = Number(e.target.value);
            setStart(month);
            saveStart.mutate(month);
          }}
        >
          {MONTH_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </Select>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          This year is {current.label}: {current.from} to {current.to}.{canManage ? "" : " Only the owner can change it."}
        </p>
      </div>
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)] sm:col-span-2">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-[var(--balance-positive)] sm:col-span-2">{saved}</p> : null}
    </section>
  );
}
