"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { formatMinorToMajor } from "@/src/core/money";
import type { GoalForecast } from "@/src/core/goal-forecast";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { forecast: GoalForecast; currency: string; targetDate: string | null; goalId: string; goalName: string; workspaceId: string };

/** A goal's milestones, and when it'll be reached at the pace money has been going in. */
export function GoalForecastView({ forecast, currency, targetDate, goalId, goalName, workspaceId }: Props) {
  const { money } = useMoneyFormat();
  const done = forecast.milestones.at(-1)?.reached;

  let line: string;
  if (done) line = "Reached.";
  else if (!forecast.paceMinor) {
    line = targetDate && forecast.neededMonthlyMinor != null ? `Nothing added in the last three months. ${money(forecast.neededMonthlyMinor, currency)} a month gets you there by ${targetDate}.` : "Nothing added in the last three months, so there's no pace to go by yet.";
  } else {
    line = `At ${money(forecast.paceMinor, currency)} a month, you'll get there around ${forecast.projectedDate}.`;
    if (targetDate && forecast.onTrack) line += ` That's in time for ${targetDate}.`;
    if (targetDate && forecast.onTrack === false && forecast.neededMonthlyMinor != null) line += ` To make ${targetDate}, set aside ${money(forecast.neededMonthlyMinor, currency)} a month.`;
  }

  return (
    <div className="mt-3 space-y-2">
      <ol aria-label="Milestones" className="grid grid-cols-4 gap-2 text-[11px]">
        {forecast.milestones.map((m) => (
          <li key={m.percent} data-milestone={m.percent} data-reached={m.reached} className={m.reached ? "text-[var(--balance-positive)]" : "text-[var(--muted-foreground)]"}>
            <span className="block font-medium">{m.reached ? "✓ " : ""}{m.percent === 100 ? "Done" : `${m.percent}%`}</span>
            <span className="block font-mono tabular-nums">{m.reached ? (m.reachedOn ?? "before records") : money(m.amountMinor, currency)}</span>
          </li>
        ))}
      </ol>
      <p data-goal-forecast className={`text-xs ${forecast.onTrack === false && !done ? "text-[var(--balance-negative)]" : "text-[var(--muted-foreground)]"}`}>{line}</p>
      {forecast.sharing ? <SavingTogether sharing={forecast.sharing} currency={currency} done={Boolean(done)} goalId={goalId} goalName={goalName} workspaceId={workspaceId} /> : null}
    </div>
  );
}

/** A shared goal: who's put in what, the members' monthly pledges, and your own. */
function SavingTogether({
  sharing,
  currency,
  done,
  goalId,
  goalName,
  workspaceId,
}: {
  sharing: NonNullable<GoalForecast["sharing"]>;
  currency: string;
  done: boolean;
  goalId: string;
  goalName: string;
  workspaceId: string;
}) {
  const { money } = useMoneyFormat();
  const queryClient = useQueryClient();
  const [pledge, setPledge] = useState(sharing.myPledgeMinor ? formatMinorToMajor(sharing.myPledgeMinor) : "");
  const save = useMutation({
    mutationFn: () => api.setGoalPledge(goalId, pledge.trim() || "0"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.savingsGoals(workspaceId) }),
  });

  return (
    <div data-saving-together className="space-y-2 border-t border-[var(--hairline)] pt-3 text-xs">
      {sharing.shares.length ? (
        <div>
          <p className="font-medium">Who&apos;s put in</p>
          <ul aria-label={`Who's put into ${goalName}`} className="mt-1 space-y-0.5">
            {sharing.shares.map((s) => (
              <li key={s.userId} className="flex justify-between gap-3">
                <span>{s.name}</span>
                <span className="font-mono tabular-nums">{money(s.amountMinor, currency)} · {s.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {sharing.pledges.length ? (
        <div>
          <p className="font-medium">Pledged a month</p>
          <ul aria-label={`Pledges to ${goalName}`} className="mt-1 space-y-0.5">
            {sharing.pledges.map((p) => (
              <li key={p.userId} data-pledge={p.name} className="flex justify-between gap-3">
                <span>{p.name} · {money(p.monthlyMinor, currency)}</span>
                <span className={p.met ? "text-[var(--balance-positive)]" : "text-[var(--muted-foreground)]"}>
                  {p.met ? "✓ in this month" : `${money(p.thisMonthMinor, currency)} in so far this month`}
                </span>
              </li>
            ))}
          </ul>
          {!done ? (
            <p className="mt-1 text-[var(--muted-foreground)]">
              {sharing.pledgedDate
                ? `With everyone's pledges (${money(sharing.pledgedMinor, currency)} a month), it'll be reached around ${sharing.pledgedDate}.`
                : null}
            </p>
          ) : null}
        </div>
      ) : null}
      {!done ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="w-32">
            <Input aria-label={`My monthly pledge to ${goalName}`} className="font-mono" inputMode="decimal" placeholder="0.00" value={pledge} onChange={(e) => setPledge(e.target.value)} />
          </div>
          <Button type="submit" variant="ghost" disabled={save.isPending}>{sharing.myPledgeMinor ? "Change my pledge" : "Pledge a month"}</Button>
          {save.error ? <span role="alert" className="text-[var(--balance-negative)]">{save.error.message}</span> : null}
        </form>
      ) : null}
    </div>
  );
}
