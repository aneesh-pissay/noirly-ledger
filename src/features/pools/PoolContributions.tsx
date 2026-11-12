"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { formatMinorToMajor } from "@/src/core/money";
import type { AllocationMode, PoolFunding } from "@/src/core/pool-contributions";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

const MODE_LABEL: Record<AllocationMode, string> = {
  none: "No shares",
  equal: "Split equally",
  percent: "By percentage",
  amount: "Fixed amounts",
};

function fundingKey(poolId: string) {
  // Under the pool's key, so its updates refresh this too.
  return [...qk.budgetPool(poolId), "funding"] as const;
}

/** The share editor, starting from what's saved. */
function AllocationForm({ poolId, funding, workspaceId, baseCurrency, onSaved }: { poolId: string; funding: PoolFunding; workspaceId: string; baseCurrency: string; onSaved: () => void }) {
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const [mode, setMode] = useState<AllocationMode>(funding.allocation.mode);
  const [target, setTarget] = useState(funding.allocation.targetMinor === null ? "" : formatMinorToMajor(funding.allocation.targetMinor));
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(funding.allocation.shares.map((s) => [s.userId, funding.allocation.mode === "equal" ? "" : formatMinorToMajor(s.value)])),
  );
  const [picked, setPicked] = useState<string[]>(funding.allocation.shares.map((s) => s.userId));
  const save = useMutation({
    mutationFn: () => api.setPoolAllocation(poolId, { mode, targetMajor: target.trim() || null, shares: picked.map((userId) => ({ userId, value: values[userId]?.trim() || "0" })) }),
    onSuccess: onSaved,
  });

  return (
    <form
      aria-label="Shares"
      className="space-y-2 border-t border-[var(--hairline)] pt-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="How it's shared" value={mode} onChange={(e) => setMode(e.target.value as AllocationMode)} className={field}>
          {(Object.keys(MODE_LABEL) as AllocationMode[]).map((m) => (
            <option key={m} value={m}>{MODE_LABEL[m]}</option>
          ))}
        </select>
        {mode === "equal" || mode === "percent" ? (
          <input aria-label={`Amount to share (${baseCurrency})`} inputMode="decimal" placeholder="the pool's limit" value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} w-36`} />
        ) : null}
      </div>
      {mode !== "none" ? (
        <ul className="space-y-1">
          {(members.data?.members ?? []).map((m) => (
            <li key={m.userId} className="flex items-center gap-2">
              <label className="flex w-44 items-center gap-1.5 truncate">
                <input type="checkbox" aria-label={`Shares: ${m.displayName}`} checked={picked.includes(m.userId)} onChange={() => setPicked(picked.includes(m.userId) ? picked.filter((x) => x !== m.userId) : [...picked, m.userId])} />
                {m.displayName}
              </label>
              {mode !== "equal" && picked.includes(m.userId) ? (
                <input
                  aria-label={mode === "percent" ? `Percent for ${m.displayName}` : `Amount for ${m.displayName}`}
                  inputMode="decimal"
                  placeholder={mode === "percent" ? "%" : baseCurrency}
                  value={values[m.userId] ?? ""}
                  onChange={(e) => setValues({ ...values, [m.userId]: e.target.value })}
                  className={`${field} w-24`}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="submit" disabled={save.isPending} className="h-9 rounded-md border border-[var(--hairline)] px-3">Save shares</button>
      {save.error ? <p role="alert" className="text-[var(--balance-negative)]">{save.error.message}</p> : null}
    </form>
  );
}

/**
 * Money in: who's expected to put what into the pool, what each has put
 * in, and the balance after spending. Anyone records their own; pool
 * managers set the shares, record for others and remind those behind.
 */
export function PoolContributions({ workspaceId, poolId, currentUserId, baseCurrency }: { workspaceId: string; poolId: string; currentUserId: string; baseCurrency: string }) {
  const queryClient = useQueryClient();
  const { money: format } = useMoneyFormat();
  const money = (minor: number) => format(minor, baseCurrency);
  const funding = useQuery({ queryKey: fundingKey(poolId), queryFn: () => api.poolFunding(poolId) });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [forUserId, setForUserId] = useState(currentUserId);

  const refresh = () => queryClient.invalidateQueries({ queryKey: fundingKey(poolId) });
  const add = useMutation({
    mutationFn: () => api.addContribution(poolId, { amountMajor: amount.trim(), date, note: note.trim() || null, forUserId: forUserId === currentUserId ? null : forUserId }),
    onSuccess: async () => {
      setAmount("");
      setNote("");
      await refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.removeContribution(id), onSuccess: refresh });
  const remind = useMutation({ mutationFn: () => api.remindContributors(poolId) });
  const error = add.error ?? remove.error ?? remind.error;

  const data = funding.data;
  if (!data) return null;
  const hasShares = data.allocation.mode !== "none";

  return (
    <section aria-label="Contributions" className="surface grain mt-6 space-y-3 rounded-[var(--r-lg)] p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Money in</h2>
        <p className="font-mono text-xs tabular-nums text-[var(--muted-foreground)]">
          <span data-contributed>{money(data.contributedMinor)}</span> put in · balance{" "}
          <span data-balance className={data.balanceMinor < 0 ? "text-[var(--balance-negative)]" : "text-[var(--foreground)]"}>{money(data.balanceMinor)}</span>
        </p>
      </div>
      {hasShares ? <p className="text-xs text-[var(--muted-foreground)]">{MODE_LABEL[data.allocation.mode]} · {money(data.targetMinor)} to share</p> : null}

      {data.standings.length ? (
        <table className="w-full text-left text-xs">
          <thead className="font-mono text-[10px] uppercase text-[var(--muted-foreground)]">
            <tr>
              <th className="py-1">Member</th>
              {hasShares ? <th className="py-1 text-right">Share</th> : null}
              <th className="py-1 text-right">Put in</th>
              {hasShares ? <th className="py-1 text-right">Still to put in</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.standings.map((s) => (
              <tr key={s.userId} data-standing={s.name} className="border-t border-[var(--hairline)]">
                <td className="py-1.5">{s.name}{s.userId === currentUserId ? " (you)" : ""}</td>
                {hasShares ? <td className="py-1.5 text-right font-mono tabular-nums">{s.expectedMinor === null ? "—" : money(s.expectedMinor)}</td> : null}
                <td className="py-1.5 text-right font-mono tabular-nums">{money(s.contributedMinor)}</td>
                {hasShares ? (
                  <td className={`py-1.5 text-right font-mono tabular-nums ${(s.owesMinor ?? 0) > 0 ? "text-[var(--balance-negative)]" : "text-[var(--balance-positive)]"}`}>
                    {s.owesMinor === null ? "—" : s.owesMinor > 0 ? money(s.owesMinor) : "Done"}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">Nothing put in yet.</p>
      )}

      <form
        aria-label="Add contribution"
        className="flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        {data.canManage ? (
          <select aria-label="Who put it in" value={forUserId} onChange={(e) => setForUserId(e.target.value)} className={field}>
            {(members.data?.members ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>{m.userId === currentUserId ? "Me" : m.displayName}</option>
            ))}
          </select>
        ) : null}
        <input aria-label={`Amount put in (${baseCurrency})`} required inputMode="decimal" placeholder={baseCurrency} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-28`} />
        <input aria-label="Date put in" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        <input aria-label="Contribution note" maxLength={200} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className={`${field} min-w-0 flex-1`} />
        <button type="submit" disabled={add.isPending} className="h-9 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-ink)]">Add</button>
      </form>

      {data.contributions.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted-foreground)]">All contributions ({data.contributions.length})</summary>
          <ul className="mt-2 space-y-1">
            {data.contributions.map((c) => (
              <li key={c.id} data-contribution={c.name} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  {c.date} · {c.name}
                  {c.note ? <span className="text-[var(--muted-foreground)]"> · {c.note}</span> : null}
                  {c.recordedByName !== c.name ? <span className="text-[var(--muted-foreground)]"> · recorded by {c.recordedByName}</span> : null}
                </span>
                <span className="flex gap-2">
                  <span className="font-mono tabular-nums">{money(c.amountMinor)}</span>
                  {c.canRemove ? (
                    <button type="button" className="text-[var(--muted-foreground)] underline" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>Remove</button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {data.canManage ? (
        <>
          <AllocationForm key={JSON.stringify(data.allocation)} poolId={poolId} funding={data} workspaceId={workspaceId} baseCurrency={baseCurrency} onSaved={() => void refresh()} />
          {hasShares ? (
            <button type="button" className="text-xs text-[var(--muted-foreground)] underline" disabled={remind.isPending} onClick={() => remind.mutate()}>
              {remind.data ? `Reminded ${remind.data.reminded}` : "Remind those behind"}
            </button>
          ) : null}
        </>
      ) : null}
      {error ? <p role="alert" className="text-xs text-[var(--balance-negative)]">{error.message}</p> : null}
    </section>
  );
}
