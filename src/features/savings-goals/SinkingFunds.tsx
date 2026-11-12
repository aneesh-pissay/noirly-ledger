"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { isoDate } from "@/src/core/budgets/period";
import { FUND_REPEATS, type FundRepeat, type FundStatus, type SinkingFundView } from "@/src/core/sinking-funds";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { ProgressBar } from "@/src/components/ProgressBar";
import { Select } from "@/src/components/Select";

type Props = { workspaceId: string; baseCurrency: string };

const REPEAT_LABEL: Record<FundRepeat, string> = { none: "Just once", quarterly: "Every 3 months", yearly: "Every year" };
const STATUS_LABEL: Record<FundStatus, string> = { ready: "Ready", on_track: "On track", behind: "Behind", overdue: "Due date passed" };
const STATUS_TONE: Record<FundStatus, string> = {
  ready: "text-[var(--balance-positive)]",
  on_track: "text-[var(--muted-foreground)]",
  behind: "text-[var(--balance-negative)]",
  overdue: "text-[var(--balance-negative)]",
};

/** Sinking funds: money set aside each month for a known lump-sum expense, with bills worth starting one for. */
export function SinkingFunds({ workspaceId, baseCurrency }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const query = useQuery({ queryKey: ["sinking-funds", workspaceId], queryFn: () => api.listSinkingFunds(workspaceId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["sinking-funds", workspaceId] });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", dueDate: "", repeat: "yearly" as FundRepeat, saved: "" });
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createSinkingFund>[1]) => api.createSinkingFund(workspaceId, body),
    onSuccess: async () => {
      setAdding(false);
      setForm({ name: "", target: "", dueDate: "", repeat: "yearly", saved: "" });
      await refresh();
    },
  });
  const move = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "in" | "out" }) => api.moveFundMoney(id, { amountMajor: amounts[id] ?? "", direction }),
    onSuccess: async (_data, { id }) => {
      setAmounts((prev) => ({ ...prev, [id]: "" }));
      await refresh();
    },
  });
  const spend = useMutation({ mutationFn: (id: string) => api.spendFund(id), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteSinkingFund(id), onSuccess: refresh });

  const funds = query.data?.funds ?? [];
  const suggestions = query.data?.suggestions ?? [];
  // What to set aside a month across all funds still filling, per currency.
  const perMonth = new Map<string, number>();
  for (const f of funds) if (f.status !== "ready") perMonth.set(f.currency, (perMonth.get(f.currency) ?? 0) + f.monthlyMinor);
  const error = create.error ?? move.error ?? spend.error ?? remove.error;

  const row = (f: SinkingFundView) => (
    <li key={f.id} data-fund={f.name} data-fund-status={f.status} className="surface grain space-y-3 rounded-[var(--r-lg)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{f.name}</p>
        <p className={`text-xs ${STATUS_TONE[f.status]}`}>{STATUS_LABEL[f.status]}</p>
      </div>
      <ProgressBar value={f.targetMinor ? f.savedMinor / f.targetMinor : 0} tone={f.status === "ready" ? "positive" : f.status === "on_track" ? "accent" : "negative"} />
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <span className="font-mono tabular-nums">{money(f.savedMinor, f.currency)} of {money(f.targetMinor, f.currency)}</span>
        <span className="text-[var(--muted-foreground)]">
          {f.status === "ready"
            ? `All there for ${f.dueDate}`
            : f.status === "overdue"
              ? `Was due ${f.dueDate}`
              : `Set aside ${money(f.monthlyMinor, f.currency)} a month · ${f.monthsLeft} month${f.monthsLeft === 1 ? "" : "s"} to ${f.dueDate}`}
          {f.repeat !== "none" ? ` · ${REPEAT_LABEL[f.repeat].toLowerCase()}` : ""}
        </span>
      </div>
      {f.status === "behind" ? (
        <p className="text-xs text-[var(--balance-negative)]">Setting aside evenly, it would have {money(f.expectedMinor, f.currency)} by now.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-32">
          <Input aria-label={`Amount for ${f.name}`} className="font-mono" inputMode="decimal" placeholder="0.00" value={amounts[f.id] ?? ""} onChange={(e) => setAmounts((prev) => ({ ...prev, [f.id]: e.target.value }))} />
        </div>
        <Button variant="ghost" disabled={!amounts[f.id] || move.isPending} onClick={() => move.mutate({ id: f.id, direction: "in" })}>Set aside</Button>
        <button type="button" className="text-xs underline" disabled={!amounts[f.id] || move.isPending} onClick={() => move.mutate({ id: f.id, direction: "out" })}>Take out</button>
        <span className="flex-1" />
        <button
          type="button"
          className="text-xs underline"
          disabled={spend.isPending}
          onClick={() => {
            const what = f.repeat === "none" ? "The fund closes." : "It starts over for the next one.";
            if (window.confirm(`Paid ${f.name}? ${money(f.targetMinor, f.currency)} comes out of the fund. ${what}`)) spend.mutate(f.id);
          }}
        >
          Paid it
        </button>
        <button type="button" className="text-xs underline" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete the ${f.name} fund?`)) remove.mutate(f.id); }}>Delete</button>
      </div>
    </li>
  );

  return (
    <section aria-label="Sinking funds" className="mt-10 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sinking funds</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {perMonth.size
              ? `Set aside ${[...perMonth].map(([c, m]) => money(m, c)).join(" + ")} a month to have each one ready in time.`
              : "Put a little aside each month for a big expense you know is coming, like insurance or a yearly renewal."}
          </p>
        </div>
        <Button variant="ghost" onClick={() => setAdding(!adding)}>{adding ? "Close" : "New fund"}</Button>
      </div>

      {adding ? (
        <form
          aria-label="New fund"
          className="grid gap-3 surface grain rounded-[var(--r-lg)] p-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name: form.name, targetMajor: form.target, currency: baseCurrency, dueDate: form.dueDate, repeat: form.repeat, ...(form.saved ? { savedMajor: form.saved } : {}) });
          }}
        >
          <div className="sm:col-span-3">
            <Label htmlFor="fund-name">For</Label>
            <Input id="fund-name" required maxLength={80} placeholder="Car insurance" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="fund-target">Amount</Label>
            <Input id="fund-target" required inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="fund-due">Due on</Label>
            <Input id="fund-due" type="date" required min={isoDate(new Date())} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="fund-repeat">Repeats</Label>
            <Select id="fund-repeat" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as FundRepeat })}>
              {FUND_REPEATS.map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="fund-saved">Already saved (optional)</Label>
            <Input id="fund-saved" inputMode="decimal" value={form.saved} onChange={(e) => setForm({ ...form, saved: e.target.value })} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Start the fund"}</Button>
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error.message}</p> : null}

      {suggestions.length ? (
        <div className="rounded-xl border border-[var(--hairline)] p-4">
          <p className="text-sm font-medium">Bills worth saving up for</p>
          <ul aria-label="Bills worth saving up for" className="mt-2 divide-y divide-[var(--hairline)] text-sm">
            {suggestions.map((s) => (
              <li key={`${s.source}-${s.id}`} data-suggestion={s.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.name}</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">
                    {money(s.amountMinor, s.currency)} due {s.dueDate}{s.repeat !== "none" ? ` · ${REPEAT_LABEL[s.repeat].toLowerCase()}` : ""} · {money(s.monthlyMinor, s.currency)} a month gets you there
                  </span>
                </span>
                <Button
                  variant="ghost"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate({
                      name: s.name,
                      targetMajor: (s.amountMinor / 100).toFixed(2),
                      currency: s.currency,
                      dueDate: s.dueDate,
                      repeat: s.repeat,
                      ...(s.source === "rule" ? { ruleId: s.id } : { paymentId: s.id }),
                    })
                  }
                >
                  Start a fund
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {funds.length ? <ul className="space-y-4">{funds.map(row)}</ul> : null}
    </section>
  );
}
