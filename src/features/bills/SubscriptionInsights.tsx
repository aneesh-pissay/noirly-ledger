"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardHeader, CardTitle } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { addDays } from "@/src/core/projection";
import { DEFAULT_REMINDER_DAYS } from "@/src/core/reminders";
import type { SubscriptionInsight } from "@/src/core/subscription-insights";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type Props = { workspaceId: string };

function list(names: string[]) {
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Price rises, subscriptions doing the same job, and ones to check on before they renew. Shows nothing when there's nothing to say. */
export function SubscriptionInsights({ workspaceId }: Props) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const insights = useQuery({ queryKey: ["subscription-insights", workspaceId], queryFn: () => api.listSubscriptionInsights(workspaceId) });
  const refresh = () => Promise.all([["subscription-insights", workspaceId], ["bills", workspaceId]].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const dismiss = useMutation({ mutationFn: (id: string) => api.dismissInsight(workspaceId, id), onSuccess: refresh });
  const stillUsed = useMutation({ mutationFn: (ruleId: string) => api.markStillUsed(ruleId), onSuccess: refresh });
  const cancelReminder = useMutation({
    mutationFn: async (insight: Extract<SubscriptionInsight, { kind: "review" }>) => {
      const current = insight.reminders;
      await api.setReminders(insight.ruleId, {
        daysBefore: current ? current.daysBefore : DEFAULT_REMINDER_DAYS,
        trialEndsOn: current?.trialEndsOn ?? null,
        cancelBy: addDays(insight.nextDate, -1),
      });
      await api.dismissInsight(workspaceId, insight.id);
    },
    onSuccess: refresh,
  });
  const items = insights.data?.insights ?? [];
  if (!items.length) return null;
  const busy = dismiss.isPending || stillUsed.isPending || cancelReminder.isPending;

  const text = (i: SubscriptionInsight) => {
    switch (i.kind) {
      case "price":
        return {
          title: `${i.name} went up ${i.percent}%`,
          body: `It charged ${money(i.toMinor, i.currency)} on ${i.on}, up from ${money(i.fromMinor, i.currency)}${i.ruleId ? "." : ". Track it to follow its charges."}`,
        };
      case "duplicate":
        return i.group
          ? { title: `${i.names.length} ${i.group} services`, body: `You pay for ${list(i.names)}: ${money(i.monthlyMinor, i.currency)} a month together. Do you need all of them?` }
          : { title: `${i.names[0]} is set up ${i.names.length} times`, body: `${i.names.length} recurring bills charge for ${i.names[0]}; one may be a mistake.` };
      case "review":
        return { title: `Still using ${i.name}?`, body: `It charges again on ${i.nextDate}: ${money(i.yearlyMinor, i.currency)} a year.` };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription insights</CardTitle>
      </CardHeader>
      <div className="px-6 pb-6">
        <ul aria-label="Subscription insights" className="divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
          {items.map((i) => {
            const { title, body } = text(i);
            return (
              <li key={i.id} data-insight={i.kind} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{title}</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">{body}</span>
                </span>
                {i.kind === "review" ? (
                  <span className="flex items-center gap-3">
                    <Button variant="ghost" disabled={busy} onClick={() => stillUsed.mutate(i.ruleId)}>Still using it</Button>
                    <Button disabled={busy} onClick={() => cancelReminder.mutate(i)}>Remind me to cancel</Button>
                  </span>
                ) : (
                  <button type="button" className="text-xs underline" disabled={busy} onClick={() => dismiss.mutate(i.id)}>Got it</button>
                )}
              </li>
            );
          })}
        </ul>
        {dismiss.error || stillUsed.error || cancelReminder.error ? (
          <p role="alert" className="mt-2 text-sm text-[var(--balance-negative)]">{(dismiss.error ?? stillUsed.error ?? cancelReminder.error)?.message}</p>
        ) : null}
      </div>
    </Card>
  );
}
