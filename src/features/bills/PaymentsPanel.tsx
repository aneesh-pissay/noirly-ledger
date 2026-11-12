"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle, Dialog, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { categoryTree } from "@/src/core/categories";
import { COMMON_CURRENCIES, formatMinorToMajor } from "@/src/core/money";
import { isoDate } from "@/src/core/budgets/period";
import { daysOverdue, PAYMENT_REPEATS, type PaymentRepeat, type PaymentView } from "@/src/core/payments";
import { UPI_APPS, upiPayLink, type UpiApp } from "@/src/core/upi";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { Select } from "@/src/components/Select";

type Props = { workspaceId: string; baseCurrency: string };

const REPEAT_LABEL: Record<PaymentRepeat, string> = { none: "Just once", monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" };

function when(payment: PaymentView, today: string) {
  if (payment.status === "paid") return `Paid on ${payment.paidOn}`;
  if (payment.status === "overdue") {
    const late = daysOverdue(payment.dueDate, today);
    return `Overdue by ${late} day${late === 1 ? "" : "s"} (due ${payment.dueDate})`;
  }
  // Days until it's due: how far today is "overdue" counting from the due date backwards.
  const left = daysOverdue(today, payment.dueDate);
  return payment.dueDate === today ? "Due today" : `Due ${payment.dueDate} · in ${left} day${left === 1 ? "" : "s"}`;
}

/** Bills paid by hand: add one with its due date, then mark it paid by recording, linking or just ticking it off. */
export function PaymentsPanel({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const today = isoDate(new Date());
  const payments = useQuery({ queryKey: ["payments", workspaceId], queryFn: () => api.listPayments(workspaceId) });
  const accounts = useQuery({ queryKey: qk.accounts(workspaceId), queryFn: () => api.listAccounts(workspaceId) });
  const categories = useQuery({ queryKey: qk.categories(workspaceId), queryFn: () => api.listCategories(workspaceId) });
  const openAccounts = (accounts.data?.accounts ?? []).filter((a) => !a.archived);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<PaymentView | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", currency: baseCurrency, dueDate: today, repeat: "monthly" as PaymentRepeat, accountId: "", categoryId: "", upiId: "", payeeName: "" });
  // UPI pays in rupees, so the payee's UPI ID is asked for on rupee bills only.
  const formCurrency = openAccounts.find((a) => a.id === form.accountId)?.currency ?? form.currency;
  const refresh = () =>
    Promise.all(
      [["payments", workspaceId], ["bills", workspaceId], ["transactions", workspaceId], qk.accounts(workspaceId)].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );

  const create = useMutation({
    mutationFn: () =>
      api.createPayment(workspaceId, {
        name: form.name,
        amountMajor: form.amount,
        currency: form.currency,
        dueDate: form.dueDate,
        repeat: form.repeat,
        accountId: form.accountId || null,
        categoryId: form.categoryId || null,
        upiId: formCurrency === "INR" ? form.upiId.trim() || null : null,
        payeeName: formCurrency === "INR" ? form.payeeName.trim() || null : null,
      }),
    onSuccess: async () => {
      setAdding(false);
      setForm((f) => ({ ...f, name: "", amount: "", upiId: "", payeeName: "" }));
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deletePayment(id), onSuccess: refresh });
  const undo = useMutation({ mutationFn: (id: string) => api.undoPayment(id), onSuccess: refresh });

  const list = payments.data?.payments ?? [];
  const open = list.filter((p) => p.status !== "paid");
  const overdue = open.filter((p) => p.status === "overdue").length;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Bills to pay</CardTitle>
          <p className="meta mt-1">
            {open.length ? `${open.length} to pay${overdue ? ` · ${overdue} overdue` : ""}` : "Bills you pay yourself, like electricity or a card bill, with their due dates."}
          </p>
        </div>
        <Button variant="ghost" onClick={() => setAdding(!adding)}>{adding ? "Close" : "New bill"}</Button>
      </CardHeader>
      <div className="space-y-4 px-6 pb-6">
        {adding ? (
          <form
            aria-label="New bill"
            className="grid gap-3 rounded-xl border border-[var(--hairline)] p-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div>
              <Label htmlFor="pay-name">Bill</Label>
              <Input id="pay-name" required maxLength={80} placeholder="Electricity" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pay-amount">Amount</Label>
              <Input id="pay-amount" required inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pay-due">Due on</Label>
              <Input id="pay-due" type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pay-repeat">Repeats</Label>
              <Select id="pay-repeat" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as PaymentRepeat })}>
                {PAYMENT_REPEATS.map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-account">Paid from</Label>
              <Select id="pay-account" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">No account</option>
                {openAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
              </Select>
            </div>
            {form.accountId ? (
              <div>
                <Label htmlFor="pay-category">Category</Label>
                <Select id="pay-category" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Uncategorized</option>
                  {categoryTree(categories.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
              </div>
            ) : (
              <div>
                <Label htmlFor="pay-currency">Currency</Label>
                <Select id="pay-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  {[...new Set([baseCurrency, ...COMMON_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
            )}
            {formCurrency === "INR" ? (
              <>
                <div>
                  <Label htmlFor="pay-upi">Payee UPI ID (optional)</Label>
                  <Input id="pay-upi" autoComplete="off" placeholder="name@bank" maxLength={100} value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="pay-payee">Payee name (optional)</Label>
                  <Input id="pay-payee" maxLength={80} value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} />
                </div>
              </>
            ) : null}
            {create.error ? <p role="alert" className="text-sm text-[var(--balance-negative)] sm:col-span-3">{create.error.message}</p> : null}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add bill"}</Button>
            </div>
          </form>
        ) : null}

        {list.length ? (
          <ul aria-label="Bills to pay" className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
            {list.map((p) => (
              <li key={p.id} data-payment={p.name} data-payment-status={p.status} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className={`block text-xs ${p.status === "overdue" ? "text-[var(--balance-negative)]" : "text-[var(--muted-foreground)]"}`}>
                    {when(p, today)}{p.repeat !== "none" ? ` · ${REPEAT_LABEL[p.repeat].toLowerCase()}` : ""}
                  </span>
                  {p.status !== "paid" && p.upiId && p.currency === "INR" ? <UpiLinks payment={p} /> : null}
                </span>
                <span className="font-mono tabular-nums">{money(p.paidAmountMinor ?? p.amountMinor, p.currency)}</span>
                {p.status === "paid" ? (
                  <button type="button" className="text-xs underline" disabled={undo.isPending} onClick={() => undo.mutate(p.id)}>Undo</button>
                ) : (
                  <span className="flex items-center gap-3">
                    <Button onClick={() => setPaying(p)}>Mark paid</Button>
                    <button type="button" className="text-xs underline" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${p.name}?`)) remove.mutate(p.id); }}>Delete</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {undo.error || remove.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{(undo.error ?? remove.error)?.message}</p> : null}
      </div>
      <PayDialog payment={paying} today={today} accounts={openAccounts} onClose={() => setPaying(null)} onPaid={refresh} />
    </Card>
  );
}

/** Links that open a UPI app ready to pay the bill; they work on a phone with the app installed. */
function UpiLinks({ payment }: { payment: PaymentView }) {
  const link = (app: UpiApp) => upiPayLink({ upiId: payment.upiId!, payeeName: payment.payeeName ?? payment.name, amountMinor: payment.amountMinor, note: payment.name }, app);
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[var(--muted-foreground)]" title="Opens on a phone with the app installed">
      <span>Pay {payment.upiId} with</span>
      {(Object.keys(UPI_APPS) as UpiApp[]).map((app) => (
        <a key={app} href={link(app)} className="text-[var(--foreground)] underline" aria-label={`Pay ${payment.name} with ${UPI_APPS[app].label}`}>
          {UPI_APPS[app].label}
        </a>
      ))}
      <button type="button" className="underline" onClick={() => void navigator.clipboard?.writeText(link("any"))}>Copy link</button>
    </span>
  );
}

function PayDialog({
  payment,
  today,
  accounts,
  onClose,
  onPaid,
}: {
  payment: PaymentView | null;
  today: string;
  accounts: Array<{ id: string; name: string; currency: string }>;
  onClose: () => void;
  onPaid: () => Promise<unknown>;
}) {
  return (
    <Dialog open={Boolean(payment)} title={payment ? `Pay ${payment.name}` : "Pay"} onClose={onClose}>
      {payment ? <PayForm key={payment.id} payment={payment} today={today} accounts={accounts} onClose={onClose} onPaid={onPaid} /> : null}
    </Dialog>
  );
}

function PayForm({ payment, today, accounts, onClose, onPaid }: { payment: PaymentView; today: string; accounts: Array<{ id: string; name: string; currency: string }>; onClose: () => void; onPaid: () => Promise<unknown> }) {
  const { money } = useMoneyFormat();
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(formatMinorToMajor(payment.amountMinor));
  const [accountId, setAccountId] = useState(payment.accountId ?? "");
  const [upiRef, setUpiRef] = useState("");
  const matches = useQuery({ queryKey: ["payment-matches", payment.id], queryFn: () => api.paymentMatches(payment.id) });
  const pay = useMutation({
    mutationFn: (body: Parameters<typeof api.payPayment>[1]) => api.payPayment(payment.id, body),
    onSuccess: async () => {
      await onPaid();
      onClose();
    },
  });

  return (
    <div className="space-y-5">
      <form
        aria-label="Record the payment"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          pay.mutate({ how: "record", paidOn, amountMajor: amount, accountId: accountId || null, upiRef: upiRef.trim() || null });
        }}
      >
        <p className="text-sm font-medium">Record the payment</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="paid-on">Paid on</Label>
            <Input id="paid-on" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="paid-amount">Amount paid</Label>
            <Input id="paid-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="paid-from">Paid from</Label>
          <Select id="paid-from" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">No account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </Select>
        </div>
        {payment.upiId ? (
          <div>
            <Label htmlFor="paid-upi-ref">UPI reference (optional)</Label>
            <Input id="paid-upi-ref" inputMode="numeric" className="font-mono" placeholder="12 digits from the app" maxLength={20} value={upiRef} onChange={(e) => setUpiRef(e.target.value)} />
          </div>
        ) : null}
        <Button type="submit" disabled={pay.isPending}>Record payment</Button>
      </form>

      <section aria-label="Already recorded" className="space-y-2 border-t border-[var(--hairline)] pt-4">
        <p className="text-sm font-medium">Or link an expense already recorded</p>
        {matches.data?.matches.length ? (
          <ul className="divide-y divide-[var(--hairline)] text-sm">
            {matches.data.matches.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-1.5">
                <span className="font-mono text-xs tabular-nums text-[var(--muted-foreground)]">{t.date}</span>
                <span className="min-w-0 flex-1 truncate">{[t.merchant, t.note].filter(Boolean).join(" · ") || "No note"}</span>
                <span className="font-mono tabular-nums">{money(t.amountMinor, t.currency)}</span>
                <Button variant="ghost" disabled={pay.isPending} onClick={() => pay.mutate({ how: "link", transactionId: t.id })}>Link</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">{matches.isLoading ? "Looking…" : `No expense of ${money(payment.amountMinor, payment.currency)} near ${payment.dueDate}.`}</p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] pt-4 text-sm">
        <span className="text-[var(--muted-foreground)]">Paid from somewhere not tracked here?</span>
        <Button variant="ghost" disabled={pay.isPending} onClick={() => pay.mutate({ how: "mark", paidOn })}>Just mark paid</Button>
      </div>
      {pay.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{pay.error.message}</p> : null}
    </div>
  );
}
