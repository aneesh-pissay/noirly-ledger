"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle, Label, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import type { ColumnMapping, DateFormat } from "@/src/core/imports";
import { BANK_FORMATS, bankFormat } from "@/src/core/bank-formats";
import type { ImportPreview } from "@/src/core/sync/types";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { Select } from "@/src/components/Select";

type Props = { workspaceId: string; baseCurrency: string; transactionsPath: string };

type ColumnKey = "date" | "description" | "amount" | "drCr" | "debit" | "credit" | "reference";

/** /transactions/import — bring in a bank or card statement: check the columns, look over every row, then import (and undo if needed). */
export function ImportScreen({ workspaceId, baseCurrency, transactionsPath }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const batches = useQuery({ queryKey: ["imports", workspaceId], queryFn: () => api.listImports(workspaceId) });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [accountId, setAccountId] = useState("");
  // Which bank's layout to read by: "auto" recognises it, "none" guesses from the column names.
  const [bank, setBank] = useState("auto");
  const [categoryId, setCategoryId] = useState("");
  // Lines left out on purpose; duplicates start out left out.
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const openAccounts = (accounts.data?.accounts ?? []).filter((a) => !a.archived);
  const currency = openAccounts.find((a) => a.id === accountId)?.currency ?? baseCurrency;

  const read = useMutation({
    mutationFn: (input: { file: File; mapping: ColumnMapping | null; bank?: string; accountId: string }) =>
      api.previewImport(workspaceId, input.file, { mapping: input.mapping, bank: input.bank ?? bank, accountId: input.accountId || null }),
    onMutate: () => setError(null),
    onSuccess: ({ preview: next }) => {
      setPreview(next);
      setSkipped(new Set(next.rows.filter((r) => r.duplicate).map((r) => r.line)));
    },
    onError: (err: Error) => { setError(err.message); setPreview(null); },
  });
  const reread = (patch: Partial<ColumnMapping> = {}, nextAccount = accountId) => {
    if (file && preview) read.mutate({ file, mapping: { ...preview.mapping, ...patch }, accountId: nextAccount });
  };
  const commit = useMutation({
    mutationFn: () => api.commitImport(workspaceId, file!, { mapping: preview!.mapping, accountId: accountId || null, categoryId: categoryId || null, skipLines: [...skipped] }),
    onMutate: () => setError(null),
    onSuccess: ({ batch }) => {
      setDone(`Imported ${batch.createdCount} transaction${batch.createdCount === 1 ? "" : "s"} from ${batch.fileName}.`);
      setPreview(null);
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ["imports", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["duplicates", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
  });
  const undo = useMutation({
    mutationFn: (batchId: string) => api.undoImport(batchId),
    onSuccess: () => {
      setDone("Import undone.");
      void queryClient.invalidateQueries({ queryKey: ["imports", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["duplicates", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
  });

  const columnSelect = (key: ColumnKey, label: string) => (
    <div>
      <Label htmlFor={`col-${key}`}>{label}</Label>
      <Select
        id={`col-${key}`}
        value={preview?.mapping[key] == null ? "" : String(preview.mapping[key])}
        onChange={(e) => reread({ [key]: e.target.value === "" ? null : Number(e.target.value) })}
      >
        <option value="">None</option>
        {(preview?.headers ?? []).map((header, i) => <option key={i} value={i}>{header || `Column ${i + 1}`}</option>)}
      </Select>
    </div>
  );

  const rows = preview?.rows ?? [];
  const importable = rows.filter((r) => !r.error && !skipped.has(r.line));
  const problems = rows.filter((r) => r.error).length;
  const twoColumns = preview ? preview.mapping.amount == null : false;

  return (
    <PageContainer size="lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import a statement</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">A CSV or Excel (.xlsx) file from your bank or card. Nothing is added until you&apos;ve looked it over, and an import can be undone.</p>
        </div>
        <Link href={transactionsPath} className="text-sm underline">Back to transactions</Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 surface grain rounded-[var(--r-lg)] p-4">
        <div>
          <Label htmlFor="import-file">Statement file</Label>
          <input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block text-sm"
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null;
              setFile(chosen);
              setDone(null);
              if (chosen) read.mutate({ file: chosen, mapping: null, accountId });
            }}
          />
        </div>
        <div>
          <Label htmlFor="import-bank">Statement from</Label>
          <Select
            id="import-bank"
            value={bank}
            onChange={(e) => {
              setBank(e.target.value);
              if (file) read.mutate({ file, mapping: null, bank: e.target.value, accountId });
            }}
          >
            <option value="auto">Recognise the bank</option>
            {BANK_FORMATS.map((format) => <option key={format.id} value={format.id}>{format.name}</option>)}
            <option value="none">Another bank (pick the columns)</option>
          </Select>
        </div>
        {openAccounts.length ? (
          <div>
            <Label htmlFor="import-account">Into account</Label>
            <Select id="import-account" value={accountId} onChange={(e) => { setAccountId(e.target.value); reread({}, e.target.value); }}>
              <option value="">No account</option>
              {openAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </Select>
          </div>
        ) : null}
        <div>
          <Label htmlFor="import-category">Category for all</Label>
          <Select id="import-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categoryTree(categories.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </div>
        {read.isPending ? <p className="text-sm text-[var(--muted-foreground)]">Reading…</p> : null}
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{error}</p> : null}
      {done ? <p role="status" className="mt-3 text-sm text-[var(--balance-positive)]">{done} <Link href={transactionsPath} className="underline">See them</Link></p> : null}

      {preview ? (
        <>
          <section aria-label="Columns" className="mt-6 grid gap-3 sm:grid-cols-4">
            {preview.mapping.bank ? (
              <p data-bank={preview.mapping.bank} className="text-sm sm:col-span-4">
                {bank === "auto" ? "Looks like a statement from" : "Read as a statement from"} {bankFormat(preview.mapping.bank)?.name ?? preview.mapping.bank}; its columns are set below.
              </p>
            ) : null}
            {preview.preamble.length ? <p className="text-xs text-[var(--muted-foreground)] sm:col-span-4">Skipped above the columns: {preview.preamble.slice(0, 3).join(" · ")}</p> : null}
            <div>
              <Label htmlFor="col-header">Column names on row</Label>
              <Select id="col-header" value={String(preview.mapping.headerRow)} onChange={(e) => reread({ headerRow: Number(e.target.value) })}>
                {Array.from({ length: 15 }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
              </Select>
            </div>
            {columnSelect("date", "Date")}
            <div>
              <Label htmlFor="col-format">Dates are</Label>
              <Select id="col-format" value={preview.mapping.dateFormat} onChange={(e) => reread({ dateFormat: e.target.value as DateFormat })}>
                <option value="DMY">Day first (31/12/2026)</option>
                <option value="MDY">Month first (12/31/2026)</option>
                <option value="YMD">Year first (2026-12-31)</option>
              </Select>
            </div>
            {columnSelect("description", "Description")}
            <div>
              <Label htmlFor="col-shape">Amounts are in</Label>
              <Select
                id="col-shape"
                value={twoColumns ? "two" : "one"}
                onChange={(e) =>
                  reread(e.target.value === "two" ? { amount: null, drCr: null } : { debit: null, credit: null, amount: preview.mapping.debit ?? preview.mapping.credit ?? 0 })
                }
              >
                <option value="one">One column (minus for money out)</option>
                <option value="two">Debit and credit columns</option>
              </Select>
            </div>
            {twoColumns ? (
              <>
                {columnSelect("debit", "Money out (debit)")}
                {columnSelect("credit", "Money in (credit)")}
              </>
            ) : (
              <>
                {columnSelect("amount", "Amount")}
                {columnSelect("drCr", "Dr/Cr column (optional)")}
              </>
            )}
            {columnSelect("reference", "Reference (optional)")}
          </section>

          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>{rows.length} rows</CardTitle>
              <p className="meta">
                {importable.length} to import{problems ? ` · ${problems} with problems` : ""}{rows.some((r) => r.duplicate) ? ` · ${rows.filter((r) => r.duplicate).length} look already recorded` : ""}
              </p>
            </CardHeader>
            <div className="max-h-[28rem] overflow-auto">
              <table aria-label="Statement rows" className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 font-normal"><span className="sr-only">Include</span></th>
                    <th className="px-3 py-2 font-normal">Line</th>
                    <th className="px-3 py-2 font-normal">Date</th>
                    <th className="px-3 py-2 font-normal">Description</th>
                    <th className="px-3 py-2 text-right font-normal">Amount</th>
                    <th className="px-3 py-2 font-normal">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.line} data-import-line={row.line} className="border-t border-[var(--hairline)]">
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Import line ${row.line}`}
                          disabled={Boolean(row.error)}
                          checked={!row.error && !skipped.has(row.line)}
                          onChange={(e) => {
                            const next = new Set(skipped);
                            if (e.target.checked) next.delete(row.line);
                            else next.add(row.line);
                            setSkipped(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-[var(--muted-foreground)]">{row.line}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{row.date ?? "—"}</td>
                      <td className="max-w-[20rem] truncate px-3 py-1.5">{row.description || "—"}</td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${row.amountMinor != null && row.amountMinor > 0 ? "text-[var(--balance-positive)]" : ""}`}>
                        {row.amountMinor == null ? "—" : money(row.amountMinor, currency)}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {row.error ? <span className="text-[var(--balance-negative)]">{row.error}</span> : row.duplicate ? <span>Looks already recorded</span> : <span className="text-[var(--muted-foreground)]">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="mt-4">
            <Button disabled={!importable.length || commit.isPending || read.isPending} onClick={() => commit.mutate()}>
              {commit.isPending ? "Importing…" : `Import ${importable.length} transaction${importable.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      ) : null}

      {batches.data?.batches.length ? (
        <section aria-label="Recent imports" className="mt-8">
          <h2 className="text-sm font-medium">Recent imports</h2>
          <ul className="mt-2 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {batches.data.batches.map((batch) => (
              <li key={batch.id} data-import={batch.fileName} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate">
                  {batch.fileName}
                  <span className="text-xs text-[var(--muted-foreground)]"> · {new Date(batch.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {batch.createdCount} added{batch.skippedCount ? `, ${batch.skippedCount} skipped` : ""}</span>
                </span>
                {batch.rolledBack ? (
                  <span className="text-xs text-[var(--muted-foreground)]">Undone</span>
                ) : (
                  <button type="button" className="text-xs underline" disabled={undo.isPending} onClick={() => { if (window.confirm(`Undo the import of ${batch.fileName}? Its ${batch.liveCount} transactions are deleted.`)) undo.mutate(batch.id); }}>
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageContainer>
  );
}
