"use client";

import type { GoalForecast } from "@/src/core/goal-forecast";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { forecast: GoalForecast; currency: string; targetDate: string | null };

/** A goal's milestones, and when it'll be reached at the pace money has been going in. */
export function GoalForecastView({ forecast, currency, targetDate }: Props) {
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
    </div>
  );
}
