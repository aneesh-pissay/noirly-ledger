"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { checkPlan, installmentDate, installmentSchedule, scheduleSummary } from "@/src/core/installments";
import { COMMON_CURRENCIES, parseMajorToMinor } from "@/src/core/money";
import { isoDate } from "@/src/core/budgets/period";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { Select } from "@/src/components/Select";

type Props = { workspaceId: string; baseCurrency: string };

function readMinor(text: string) {
  try {
    return text.trim() ? parseMajorToMinor(text.trim()) : 0;
  } catch {
    return null;
  }
}

/** EMI purchases: start one with a preview of what it costs, and follow or pay off the ones running. */
export function EmiPanel({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const plans = useQuery({ queryKey: qk.installments(workspaceId), queryFn: () => api.listInstallmentPlans(workspaceId) });
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [months, setMonths] = useState("12");
  const [rate, setRate] = useState("0");
  const [tax, setTax] = useState(baseCurrency === "INR" ? "18" : "0");
  const [fee, setFee] = useState("");
  const [firstDate, setFirstDate] = useState(() => installmentDate(isoDate(new Date()), 1));
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const openAccounts = (accounts.data?.accounts ?? []).filter((a) => !a.archived);
  const account = openAccounts.find((a) => a.id === accountId);
  const payIn = account?.currency ?? currency;

  const preview = useMemo(() => {
    const principalMinor = readMinor(price);
    const feeMinor = readMinor(fee);
    const input = { principalMinor: principalMinor ?? 0, months: Number(months), annualRatePct: Number(rate), taxOnInterestPct: Number(tax) };
    if (principalMinor == null || feeMinor == null || !checkPlan(input).ok) return null;
    const rows = installmentSchedule({ ...input, firstDate });
    return { rows, summary: scheduleSummary(rows, feeMinor) };
  }, [price, fee, months, rate, tax, firstDate]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
  };
  const create = useMutation({
    mutationFn: () =>
      api.createInstallmentPlan(workspaceId, {
        name: name.trim(),
        principalMajor: price.trim(),
        currency: payIn,
        months: Number(months),
        annualRatePct: Number(rate),
        taxOnInterestPct: Number(tax),
        processingFeeMajor: fee.trim() || null,
        firstDate,
        accountId: accountId || null,
        categoryId: categoryId || null,
      }),
    onMutate: () => setError(null),
    onSuccess: () => { setOpen(false); setName(""); setPrice(""); setFee(""); refresh(); },
    onError: (err: Error) => setError(err.message),
  });
  const close = useMutation({
    mutationFn: (planId: string) => api.closeInstallmentPlan(planId, null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (planId: string) => api.deleteInstallmentPlan(planId),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const list = plans.data?.plans ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>EMI purchases</CardTitle>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Cancel" : "New EMI"}</Button>
      </CardHeader>
      <div className="space-y-4 px-5 pb-5">
        {open ? (
          <form aria-label="New EMI" className="grid gap-3 rounded-xl border border-[var(--hairline)] p-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (preview && name.trim()) create.mutate(); }}>
            <div className="sm:col-span-2">
              <Label htmlFor="emi-name">What it&apos;s for</Label>
              <Input id="emi-name" maxLength={80} value={name} placeholder="e.g. Phone" onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="emi-price">Price ({payIn})</Label>
              <Input id="emi-price" inputMode="decimal" className="font-mono" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="emi-months">Months</Label>
              <Input id="emi-months" inputMode="numeric" className="font-mono" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} required />
            </div>
            <div>
              <Label htmlFor="emi-rate">Interest a year (%; 0 for no-cost)</Label>
              <Input id="emi-rate" inputMode="decimal" className="font-mono" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="emi-tax">Tax on interest (%)</Label>
              <Input id="emi-tax" inputMode="decimal" className="font-mono" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="emi-fee">Processing fee (optional)</Label>
              <Input id="emi-fee" inputMode="decimal" className="font-mono" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="emi-first">First payment</Label>
              <Input id="emi-first" type="date" className="font-mono" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} required />
            </div>
            {openAccounts.length ? (
              <div>
                <Label htmlFor="emi-account">Paid from</Label>
                <Select id="emi-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">No account</option>
                  {openAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </div>
            ) : null}
            {!account ? (
              <div>
                <Label htmlFor="emi-currency">Currency</Label>
                <Select id="emi-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {[...new Set([baseCurrency, ...COMMON_CURRENCIES])].map((code) => <option key={code} value={code}>{code}</option>)}
                </Select>
              </div>
            ) : null}
            <div>
              <Label htmlFor="emi-category">Category</Label>
              <Select id="emi-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Uncategorized</option>
                {categoryTree(categories.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </div>
            {preview ? (
              <div role="status" aria-label="EMI preview" className="space-y-1 rounded-lg bg-[var(--surface-2)] p-3 text-sm sm:col-span-3">
                <p>
                  <span className="font-mono">{money(preview.summary.monthlyMinor, payIn)}</span> a month for {months} months
                  {preview.summary.costMinor ? (
                    <> · costs <span className="font-mono">{money(preview.summary.costMinor, payIn)}</span> on top (interest {money(preview.summary.interestMinor, payIn)}, tax {money(preview.summary.taxMinor, payIn)}{preview.summary.processingFeeMinor ? `, fee ${money(preview.summary.processingFeeMinor, payIn)}` : ""})</>
                  ) : " · no extra cost"}
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {preview.rows[0]!.date} to {preview.rows.at(-1)!.date}; {money(preview.summary.totalMinor, payIn)} in all. Each payment is added as an expense on its date.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)] sm:col-span-3">Enter the price and 2 to 120 months to see the payments.</p>
            )}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={!preview || !name.trim() || create.isPending}>{create.isPending ? "Adding…" : "Add EMI"}</Button>
            </div>
          </form>
        ) : null}
        {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error}</p> : null}

        {list.length ? (
          <ul aria-label="EMI plans" className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {list.map((plan) => (
              <li key={plan.id} data-emi={plan.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{plan.name}{plan.closed ? <span className="ml-2 font-mono text-[10px] text-[var(--muted-foreground)]">PAID OFF</span> : null}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {money(plan.monthlyMinor, plan.currency)} a month · {plan.paidCount} of {plan.months} paid
                    {plan.nextDate ? ` · next ${plan.nextDate}` : ""}
                    {plan.annualRatePct ? ` · ${plan.annualRatePct}% a year` : " · no-cost"}
                  </p>
                </div>
                <div className="text-right font-mono text-xs tabular-nums">
                  <p>{money(plan.leftToPayMinor, plan.currency)} to go</p>
                  {!plan.closed ? <p className="text-[var(--muted-foreground)]">{money(plan.principalLeftMinor, plan.currency)} to pay off now</p> : null}
                </div>
                <div className="flex gap-2">
                  {!plan.closed && plan.nextDate ? (
                    <button type="button" className="text-xs underline" disabled={close.isPending}
                      onClick={() => { if (window.confirm(`Pay off ${plan.name} now? The payments still to come are removed and one payment of ${money(plan.principalLeftMinor, plan.currency)} is added today.`)) close.mutate(plan.id); }}>
                      Pay off early
                    </button>
                  ) : null}
                  <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]" aria-label={`Delete ${plan.name}`} disabled={remove.isPending}
                    onClick={() => { if (window.confirm(`Delete ${plan.name} and all its payments?`)) remove.mutate(plan.id); }}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : !open ? (
          <p className="text-sm text-[var(--muted-foreground)]">Bought something on EMI? Add it and each month&apos;s payment shows up in its month.</p>
        ) : null}
      </div>
    </Card>
  );
}
