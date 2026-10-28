"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { isoDate } from "@/src/core/budgets/period";
import { MAX_LOAN_MONTHS, type LoanView } from "@/src/core/loans";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { Select } from "@/src/components/Select";

type Props = { workspaceId: string };

const STATUS_TONE = { paid: "text-[var(--muted-foreground)]", overdue: "text-[var(--balance-negative)]", upcoming: "" } as const;

/** Loans repaid in EMIs: set one up on its loan account, record each EMI as it's paid, and see the schedule. */
export function LoansPanel({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const loans = useQuery({ queryKey: ["loans", workspaceId], queryFn: () => api.listLoans(workspaceId) });
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const open = (accounts.data?.accounts ?? []).filter((a) => !a.archived);
  const loanAccounts = open.filter((a) => a.kind === "loan");
  const payers = open.filter((a) => a.kind !== "loan");
  const [adding, setAdding] = useState(false);
  const [showing, setShowing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", loanAccountId: "", payFromAccountId: "", categoryId: "", principal: "", rate: "", months: "", firstDate: "" });
  const refresh = () =>
    Promise.all(
      [["loans", workspaceId], ["bills", workspaceId], ["transactions", workspaceId], qk.accounts(workspaceId)].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );

  const create = useMutation({
    mutationFn: () =>
      api.createLoan(workspaceId, {
        name: form.name,
        loanAccountId: form.loanAccountId,
        payFromAccountId: form.payFromAccountId,
        categoryId: form.categoryId || null,
        principalMajor: form.principal,
        annualRatePct: Number(form.rate || "0"),
        months: Number(form.months),
        firstDate: form.firstDate,
      }),
    onSuccess: async () => {
      setAdding(false);
      setForm({ name: "", loanAccountId: "", payFromAccountId: "", categoryId: "", principal: "", rate: "", months: "", firstDate: "" });
      await refresh();
    },
  });
  const record = useMutation({ mutationFn: (id: string) => api.recordEmi(id), onSuccess: refresh });
  const undo = useMutation({ mutationFn: (id: string) => api.undoLastEmi(id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteLoan(id), onSuccess: refresh });
  const error = create.error ?? record.error ?? undo.error ?? remove.error;
  const today = isoDate(new Date());

  const card = (loan: LoanView) => {
    const s = loan.summary;
    const next = loan.rows.find((r) => r.status !== "paid");
    return (
      <li key={loan.id} data-loan={loan.name} className="space-y-3 rounded-xl border border-[var(--hairline)] p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">{loan.name}</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {loan.annualRatePct}% a year · {loan.months} months · ends {s.endDate}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div><dt className="text-[var(--muted-foreground)]">EMI</dt><dd className="font-mono tabular-nums">{money(s.emiMinor, loan.currency)}</dd></div>
          <div><dt className="text-[var(--muted-foreground)]">Paid</dt><dd>{s.paidCount} of {loan.months} · {s.monthsLeft} left</dd></div>
          <div><dt className="text-[var(--muted-foreground)]">Principal left</dt><dd className="font-mono tabular-nums">{money(s.principalLeftMinor, loan.currency)}</dd></div>
          <div><dt className="text-[var(--muted-foreground)]">Interest paid / to come</dt><dd className="font-mono tabular-nums">{money(s.interestPaidMinor, loan.currency)} / {money(s.interestLeftMinor, loan.currency)}</dd></div>
        </dl>
        {s.overdueCount ? (
          <p role="note" className="text-xs text-[var(--balance-negative)]">
            {s.overdueCount} EMI{s.overdueCount === 1 ? "" : "s"} not recorded since {s.nextDate}. Record {s.overdueCount === 1 ? "it" : "them"} once paid.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {next ? (
            <Button disabled={record.isPending || next.date > today} onClick={() => record.mutate(loan.id)}>
              Record EMI {next.number} ({next.date})
            </Button>
          ) : (
            <span className="text-xs text-[var(--balance-positive)]">Paid off</span>
          )}
          {s.paidCount ? <button type="button" className="text-xs underline" disabled={undo.isPending} onClick={() => undo.mutate(loan.id)}>Undo last EMI</button> : null}
          <button type="button" className="text-xs underline" aria-expanded={showing === loan.id} onClick={() => setShowing(showing === loan.id ? null : loan.id)}>
            {showing === loan.id ? "Hide schedule" : "Show schedule"}
          </button>
          <span className="flex-1" />
          <button type="button" className="text-xs underline" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove ${loan.name}'s schedule? EMIs already recorded stay.`)) remove.mutate(loan.id); }}>
            Remove
          </button>
        </div>
        {showing === loan.id ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-[var(--hairline)]">
            <table aria-label={`${loan.name} schedule`} className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-[var(--surface)] text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">EMI</th>
                  <th className="px-3 py-2 text-left font-normal">Date</th>
                  <th className="px-3 py-2 font-normal">Interest</th>
                  <th className="px-3 py-2 font-normal">Principal</th>
                  <th className="px-3 py-2 font-normal">Owed after</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {loan.rows.map((r) => (
                  <tr key={r.number} data-emi={r.number} className={`border-t border-[var(--hairline)] ${STATUS_TONE[r.status]}`}>
                    <td className="px-3 py-1 text-left">{r.number}</td>
                    <td className="px-3 py-1 text-left">{r.date}</td>
                    <td className="px-3 py-1">{money(r.interestMinor, loan.currency)}</td>
                    <td className="px-3 py-1">{money(r.principalMinor, loan.currency)}</td>
                    <td className="px-3 py-1">{money(r.balanceMinor, loan.currency)}</td>
                    <td className="px-3 py-1 text-left font-sans">{r.status === "paid" ? "Paid" : r.status === "overdue" ? "Not recorded" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </li>
    );
  };

  const list = loans.data?.loans ?? [];
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Loans</CardTitle>
          <p className="meta mt-1">Home, car or other loans paid in EMIs: each EMI&apos;s interest is spending, and its principal brings down what you owe.</p>
        </div>
        <Button variant="ghost" onClick={() => setAdding(!adding)}>{adding ? "Close" : "New loan"}</Button>
      </CardHeader>
      <div className="space-y-4 px-6 pb-6">
        {adding ? (
          loanAccounts.length && payers.length ? (
            <form
              aria-label="New loan"
              className="grid gap-3 rounded-xl border border-[var(--hairline)] p-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div className="sm:col-span-3">
                <Label htmlFor="loan-name">Name</Label>
                <Input id="loan-name" required maxLength={80} placeholder="Home loan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="loan-account">Loan account</Label>
                <Select id="loan-account" required value={form.loanAccountId} onChange={(e) => setForm({ ...form, loanAccountId: e.target.value })}>
                  <option value="">Pick one</option>
                  {loanAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="loan-from">EMIs paid from</Label>
                <Select id="loan-from" required value={form.payFromAccountId} onChange={(e) => setForm({ ...form, payFromAccountId: e.target.value })}>
                  <option value="">Pick one</option>
                  {payers.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="loan-category">Interest counts as</Label>
                <Select id="loan-category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {categoryTree(categories.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="loan-principal">Amount borrowed</Label>
                <Input id="loan-principal" required inputMode="decimal" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="loan-rate">Interest (% a year)</Label>
                <Input id="loan-rate" required inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="loan-months">Months</Label>
                <Input id="loan-months" required inputMode="numeric" placeholder={`up to ${MAX_LOAN_MONTHS}`} value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="loan-first">First EMI on</Label>
                <Input id="loan-first" type="date" required value={form.firstDate} onChange={(e) => setForm({ ...form, firstDate: e.target.value })} />
              </div>
              <div className="flex items-end sm:col-span-2">
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add loan"}</Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">Add a loan account, and the bank account its EMIs come from, on the Accounts page first.</p>
          )
        ) : null}
        {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}
        {list.length ? <ul className="space-y-3">{list.map(card)}</ul> : !adding ? <p className="text-sm text-[var(--muted-foreground)]">No loans yet.</p> : null}
      </div>
    </Card>
  );
}
