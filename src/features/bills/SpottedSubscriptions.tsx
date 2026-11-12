"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import type { Cadence, SpottedSubscription } from "@/src/core/subscriptions";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { workspaceId: string };

const EVERY: Record<Cadence, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly" };

/** Subscriptions found in past spending: track one as a recurring bill, or set it aside. Shows nothing when there are none. */
export function SpottedSubscriptions({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const spotted = useQuery({ queryKey: ["subscriptions", workspaceId], queryFn: () => api.listSpottedSubscriptions(workspaceId) });
  const refresh = () =>
    Promise.all([["subscriptions", workspaceId], ["subscription-insights", workspaceId], ["bills", workspaceId], ["transactions", workspaceId]].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const track = useMutation({ mutationFn: (key: string) => api.trackSubscription(workspaceId, key), onSuccess: refresh });
  const dismiss = useMutation({ mutationFn: (key: string) => api.dismissSubscription(workspaceId, key), onSuccess: refresh });

  const list = spotted.data?.subscriptions ?? [];
  if (!list.length) return null;
  const running = list.filter((s) => s.active);
  // What the running ones come to a month, per currency.
  const perMonth = new Map<string, number>();
  for (const s of running) perMonth.set(s.currency, (perMonth.get(s.currency) ?? 0) + s.monthlyMinor);
  const busy = track.isPending || dismiss.isPending;

  const describe = (s: SpottedSubscription) => {
    const price = s.lastMinor !== s.previousMinor ? `now ${money(s.lastMinor, s.currency)}, was ${money(s.previousMinor, s.currency)}` : `${money(s.lastMinor, s.currency)}`;
    return `${EVERY[s.cadence]} · ${price} · charged ${s.count} times since ${s.firstDate}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriptions spotted in your spending</CardTitle>
        <p className="meta mt-1">
          {running.length ? `${running.length} running, about ${[...perMonth].map(([c, m]) => money(m, c)).join(" + ")} a month. ` : ""}
          Track one to see its next charges on the calendar and get reminders.
        </p>
      </CardHeader>
      <div className="px-6 pb-6">
        <ul aria-label="Spotted subscriptions" className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
          {list.map((s) => (
            <li key={`${s.key}|${s.currency}`} data-subscription={s.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">{describe(s)}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {s.active ? `Next charge around ${s.nextDate}` : `No charge since ${s.lastDate}; it may have been cancelled`}
                </span>
              </span>
              <span className="text-right font-mono tabular-nums">
                {money(s.monthlyMinor, s.currency)}
                <span className="block text-[11px] text-[var(--muted-foreground)]">a month</span>
              </span>
              <span className="flex items-center gap-3">
                {s.active ? <Button disabled={busy} onClick={() => track.mutate(s.key)}>Track</Button> : null}
                <button type="button" className="text-xs underline" disabled={busy} onClick={() => dismiss.mutate(s.key)}>Not a subscription</button>
              </span>
            </li>
          ))}
        </ul>
        {track.error || dismiss.error ? <p role="alert" className="mt-2 text-sm text-[var(--balance-negative)]">{(track.error ?? dismiss.error)?.message}</p> : null}
      </div>
    </Card>
  );
}
