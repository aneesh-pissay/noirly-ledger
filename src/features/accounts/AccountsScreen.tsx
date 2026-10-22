"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { COMMON_CURRENCIES, formatMinorToMajor } from "@/src/core/money";
import { isoDate } from "@/src/core/budgets/period";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABEL, isLiability, type AccountKind } from "@/src/core/accounts";
import type { Account } from "@/src/core/sync/types";
import { MoneyText } from "@/src/components/MoneyText";
import { Select } from "@/src/components/Select";
import { NetWorthPanel } from "@/src/features/accounts/NetWorthPanel";

type Props = { workspaceId: string; baseCurrency: string };

/** /accounts — where your money is kept or owed, with each one's balance. */
export function AccountsScreen({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [currency, setCurrency] = useState(baseCurrency);
  const [opening, setOpening] = useState("");
  const [openingDate, setOpeningDate] = useState(isoDate(new Date()));
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) });

  const create = useMutation({
    mutationFn: () => api.createAccount(workspaceId, {
      name: name.trim(), kind, currency, openingMajor: opening.trim() || "0", openingDate, institution: institution.trim() || null,
    }),
    onMutate: () => setError(null),
    onSuccess: () => { setName(""); setOpening(""); setInstitution(""); refresh(); },
    onError: (err: Error) => setError(err.message),
  });
  const change = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const [reconciling, setReconciling] = useState<string | null>(null);
  const [statement, setStatement] = useState("");
  const [through, setThrough] = useState(isoDate(new Date()));
  const [reconcileNote, setReconcileNote] = useState<string | null>(null);
  const reconcile = useMutation({
    mutationFn: (accountId: string) => api.reconcileAccount(accountId, { statementMajor: statement.trim(), through }),
    onMutate: () => { setError(null); setReconcileNote(null); },
    onSuccess: ({ reconciled }) => {
      setReconciling(null);
      setStatement("");
      setReconcileNote(`Reconciled ${reconciled} transaction${reconciled === 1 ? "" : "s"}.`);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["transactions", workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const list = accounts.data?.accounts ?? [];
  const open = list.filter((a) => !a.archived);
  const archived = list.filter((a) => a.archived);
  const groups: Array<{ title: string; hint: string; items: Account[] }> = [
    { title: "What you have", hint: "Cash, bank accounts and wallets", items: open.filter((a) => !isLiability(a.kind)) },
    { title: "What you owe", hint: "Credit cards and loans: the balance is the amount owed", items: open.filter((a) => isLiability(a.kind)) },
  ];

  const row = (account: Account) => (
    <li key={account.id} data-account={account.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{account.name}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {ACCOUNT_KIND_LABEL[account.kind]}{account.institution ? ` · ${account.institution}` : ""} ·{" "}
          <Link href={`/transactions?account=${account.id}`} className="underline-offset-2 hover:underline">
            {account.transactionCount} transaction{account.transactionCount === 1 ? "" : "s"}
          </Link>
        </p>
      </div>
      <div className="text-right">
        <MoneyText amountMinor={account.balanceMinor} currency={account.currency}
          tone={isLiability(account.kind) ? (account.balanceMinor > 0 ? "negative" : "default") : account.balanceMinor < 0 ? "negative" : "default"} />
        {isLiability(account.kind) ? <p className="text-[11px] text-[var(--muted-foreground)]">owed</p> : null}
        {account.pendingCount ? (
          <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
            {formatMinorToMajor(account.clearedBalanceMinor)} cleared · {account.pendingCount} pending
          </p>
        ) : null}
        {account.reconciledThrough ? (
          <p className="text-[11px] text-[var(--muted-foreground)]">Reconciled through {account.reconciledThrough}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        {!account.archived ? (
          <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-expanded={reconciling === account.id}
            onClick={() => { setError(null); setReconciling(reconciling === account.id ? null : account.id); }}>
            Reconcile
          </button>
        ) : null}
        <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]" disabled={change.isPending}
          onClick={() => change.mutate(() => api.updateAccount(account.id, { archived: !account.archived }))}>
          {account.archived ? "Reopen" : "Archive"}
        </button>
        {account.transactionCount === 0 ? (
          <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)]" disabled={change.isPending}
            aria-label={`Delete ${account.name}`}
            onClick={() => { if (window.confirm(`Delete “${account.name}”?`)) change.mutate(() => api.deleteAccount(account.id)); }}>
            Delete
          </button>
        ) : null}
      </div>
      {reconciling === account.id ? (
        <form
          aria-label={`Reconcile ${account.name}`}
          className="flex w-full flex-wrap items-end gap-3 pt-2"
          onSubmit={(event) => { event.preventDefault(); if (statement.trim()) reconcile.mutate(account.id); }}
        >
          <div>
            <Label htmlFor={`st-${account.id}`}>Statement {isLiability(account.kind) ? "amount owed" : "balance"} ({account.currency})</Label>
            <Input id={`st-${account.id}`} className="font-mono" inputMode="decimal" value={statement} onChange={(e) => setStatement(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor={`th-${account.id}`}>Statement ends</Label>
            <Input id={`th-${account.id}`} type="date" className="font-mono" value={through} onChange={(e) => setThrough(e.target.value)} required />
          </div>
          <Button type="submit" disabled={reconcile.isPending || !statement.trim()}>{reconcile.isPending ? "Checking…" : "Reconcile"}</Button>
          <p className="w-full text-xs text-[var(--muted-foreground)]">
            Cleared transactions up to that day should add up to the statement. Pending ones are left out.
          </p>
        </form>
      ) : null}
    </li>
  );

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Pick an account when you add a transaction and its balance follows. Each account keeps its own currency.
      </p>
      <NetWorthPanel workspaceId={workspaceId} />

      <form
        className="mt-6 grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-2"
        aria-label="New account"
        onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}
      >
        <div>
          <Label htmlFor="a-name">Name</Label>
          <Input id="a-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. HDFC savings" required />
        </div>
        <div>
          <Label htmlFor="a-kind">Kind</Label>
          <Select id="a-kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {ACCOUNT_KINDS.map((value) => <option key={value} value={value}>{ACCOUNT_KIND_LABEL[value]}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="a-currency">Currency</Label>
          <Select id="a-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([baseCurrency, ...COMMON_CURRENCIES])].map((code) => <option key={code} value={code}>{code}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="a-opening">{isLiability(kind) ? "Owed on" : "Balance on"} the start date</Label>
          <Input id="a-opening" className="font-mono" inputMode="decimal" placeholder="0.00" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="a-date">Start date</Label>
          <Input id="a-date" type="date" className="font-mono" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="a-inst">Bank or provider (optional)</Label>
          <Input id="a-inst" value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={80} />
        </div>
        {error && !reconciling ? <p role="alert" className="text-sm text-[var(--balance-negative)] sm:col-span-2">{error}</p> : null}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending || !name.trim()}>{create.isPending ? "Adding…" : "Add account"}</Button>
        </div>
      </form>

      {error && reconciling ? <p role="alert" className="mt-6 text-sm text-[var(--balance-negative)]">{error}</p> : null}
      {reconcileNote ? <p role="status" className="mt-6 text-sm text-[var(--balance-positive)]">{reconcileNote}</p> : null}
      {accounts.isPending ? <p className="mt-6 text-sm text-[var(--muted-foreground)]">Loading accounts…</p> : null}
      {accounts.data && !list.length ? <p className="mt-6 text-sm text-[var(--muted-foreground)]">No accounts yet.</p> : null}
      {groups.map((group) => (group.items.length ? (
        <section key={group.title} aria-label={group.title} className="mt-8">
          <h2 className="text-sm font-medium">{group.title}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">{group.hint}</p>
          <ul className="mt-3 divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)]">{group.items.map(row)}</ul>
        </section>
      ) : null))}
      {archived.length ? (
        <section aria-label="Archived" className="mt-8 opacity-70">
          <h2 className="text-sm font-medium">Archived</h2>
          <ul className="mt-3 divide-y divide-[var(--hairline)] overflow-hidden rounded-xl border border-[var(--hairline)]">{archived.map(row)}</ul>
        </section>
      ) : null}
    </PageContainer>
  );
}
