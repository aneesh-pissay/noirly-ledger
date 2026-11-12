"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { formatMinorToMajor } from "@/src/core/money";
import { DEFAULT_DUE_DAYS, DEFAULT_MINIMUM_PCT, type CardView } from "@/src/core/credit-cards";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { ProgressBar } from "@/src/components/ProgressBar";

type Props = { workspaceId: string };

/** Using more than this share of a limit is worth a word: it weighs on a credit score. */
const HIGH_USE_PCT = 30;

/** Each credit card's bill: the last statement, what's left to pay and by when, the minimum, and how much of the limit is used. */
export function CardBillsPanel({ workspaceId }: Props) {
  const { money } = useMoneyFormat();
  // Under the accounts key, so anything that changes balances refreshes it.
  const query = useQuery({ queryKey: [...qk.accounts(workspaceId), "cards"], queryFn: () => api.listCards(workspaceId) });
  const [editing, setEditing] = useState<string | null>(null);
  const cards = query.data?.cards ?? [];
  if (!cards.length) return null;

  const status = (card: CardView) => {
    const bill = card.bill!;
    switch (bill.status) {
      case "nothing_due":
        return { text: `Nothing on the ${bill.lastStatement} statement.`, tone: "text-[var(--muted-foreground)]" };
      case "paid":
        return { text: `Paid: the ${money(bill.statementMinor, card.currency)} statement of ${bill.lastStatement} is cleared.`, tone: "text-[var(--balance-positive)]" };
      case "overdue":
        return { text: `Overdue since ${bill.dueDate}: ${money(bill.leftMinor, card.currency)} still to pay. Late fees and interest may apply.`, tone: "text-[var(--balance-negative)]" };
      case "due":
        return {
          text: `${money(bill.leftMinor, card.currency)} to pay by ${bill.dueDate}${bill.minimumLeftMinor ? ` (at least ${money(bill.minimumLeftMinor, card.currency)})` : " (minimum paid)"}.`,
          tone: "",
        };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card bills</CardTitle>
        <p className="meta mt-1">Set each card&apos;s statement day to follow its bill: what&apos;s due, by when, and a reminder before it is.</p>
      </CardHeader>
      <ul className="space-y-3 px-6 pb-6">
        {cards.map((card) => (
          <li key={card.accountId} data-card={card.name} className="space-y-2 rounded-xl border border-[var(--hairline)] p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{card.name}</p>
              <button type="button" className="text-xs underline" aria-expanded={editing === card.accountId} onClick={() => setEditing(editing === card.accountId ? null : card.accountId)}>
                {card.terms ? "Change statement dates" : "Set statement dates"}
              </button>
            </div>
            {card.bill ? (
              <>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Statement of {card.bill.lastStatement}: {money(card.bill.statementMinor, card.currency)} · next statement {card.bill.nextStatement}
                </p>
                <p data-card-status={card.bill.status} className={status(card).tone}>{status(card).text}</p>
              </>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">{money(card.balanceNowMinor, card.currency)} owed now. Add the statement day to see what&apos;s due and when.</p>
            )}
            {card.bill?.utilizationPct != null && card.terms?.creditLimitMinor ? (
              <div className="space-y-1">
                <ProgressBar value={card.bill.utilizationPct / 100} tone={card.bill.utilizationPct > HIGH_USE_PCT ? "negative" : "accent"} />
                <p className={`text-xs ${card.bill.utilizationPct > HIGH_USE_PCT ? "text-[var(--balance-negative)]" : "text-[var(--muted-foreground)]"}`}>
                  {card.bill.utilizationPct}% of the {money(card.terms.creditLimitMinor, card.currency)} limit in use
                  {card.bill.utilizationPct > HIGH_USE_PCT ? `; over ${HIGH_USE_PCT}% can weigh on a credit score` : ""}
                </p>
              </div>
            ) : null}
            {editing === card.accountId ? <TermsForm workspaceId={workspaceId} card={card} onDone={() => setEditing(null)} /> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TermsForm({ workspaceId, card, onDone }: { workspaceId: string; card: CardView; onDone: () => void }) {
  const queryClient = useQueryClient();
  const t = card.terms;
  const [statementDay, setStatementDay] = useState(t ? String(t.statementDay) : "");
  const [dueDays, setDueDays] = useState(String(t?.dueDays ?? DEFAULT_DUE_DAYS));
  const [limit, setLimit] = useState(t?.creditLimitMinor ? formatMinorToMajor(t.creditLimitMinor) : "");
  const [minimumPct, setMinimumPct] = useState(String(t?.minimumPct ?? DEFAULT_MINIMUM_PCT));
  const save = useMutation({
    mutationFn: () =>
      api.setCardTerms(card.accountId, {
        statementDay: Number(statementDay),
        dueDays: Number(dueDays),
        creditLimitMajor: limit.trim() || null,
        minimumPct: Number(minimumPct),
      }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) }), queryClient.invalidateQueries({ queryKey: ["bills", workspaceId] })]);
      onDone();
    },
  });
  const id = (name: string) => `${name}-${card.accountId}`;
  return (
    <form
      aria-label={`Statement dates for ${card.name}`}
      className="grid gap-3 border-t border-[var(--hairline)] pt-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <Label htmlFor={id("statement")}>Statement day</Label>
        <Input id={id("statement")} required inputMode="numeric" placeholder="1–31" value={statementDay} onChange={(e) => setStatementDay(e.target.value)} />
      </div>
      <div>
        <Label htmlFor={id("due")}>Days to pay</Label>
        <Input id={id("due")} required inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
      </div>
      <div>
        <Label htmlFor={id("limit")}>Credit limit (optional)</Label>
        <Input id={id("limit")} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </div>
      <div>
        <Label htmlFor={id("minimum")}>Minimum due (%)</Label>
        <Input id={id("minimum")} inputMode="decimal" value={minimumPct} onChange={(e) => setMinimumPct(e.target.value)} />
      </div>
      {save.error ? <p role="alert" className="text-sm text-[var(--balance-negative)] sm:col-span-4">{save.error.message}</p> : null}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={save.isPending}>Save</Button>
      </div>
    </form>
  );
}
