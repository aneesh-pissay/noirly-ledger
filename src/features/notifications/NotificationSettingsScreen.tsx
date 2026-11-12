"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { formatMinorToMajor } from "@/src/core/money";
import { MAX_REMINDER_DAYS } from "@/src/core/reminders";
import { MAX_BUDGET_LEVELS, NOTIFICATION_TOPICS, TOPIC_LABEL, type NotificationPrefs, type NotificationTopic } from "@/src/core/notification-prefs";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

/** What to hear about and how, set for each workspace you're in. */
export function NotificationSettingsScreen({ initialWorkspaceId }: { initialWorkspaceId: string }) {
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces() });
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const prefs = useQuery({ queryKey: ["notification-prefs", workspaceId], queryFn: () => api.getNotificationPrefs(workspaceId) });
  const workspace = workspaces.data?.workspaces.find((w) => w.id === workspaceId);

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">Choose what you hear about and how, for each workspace: in Ledger, by email, or not at all. Thresholds are yours alone; others in the workspace set their own.</p>
      {(workspaces.data?.workspaces.length ?? 0) > 1 ? (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-[var(--muted-foreground)]">Workspace</span>
          <select aria-label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className={field}>
            {workspaces.data!.workspaces.map((w) => <option key={w.id} value={w.id}>{w.kind === "personal" ? "Personal" : w.name}</option>)}
          </select>
        </label>
      ) : null}
      {prefs.data ? <PrefsForm key={workspaceId} workspaceId={workspaceId} currency={workspace?.baseCurrency ?? ""} team={workspace?.kind === "team"} initial={prefs.data.prefs} /> : null}
      {prefs.error ? <p role="alert" className="mt-3 text-sm text-[var(--balance-negative)]">{prefs.error.message}</p> : null}
    </PageContainer>
  );
}

function PrefsForm({ workspaceId, currency, team, initial }: { workspaceId: string; currency: string; team: boolean; initial: NotificationPrefs }) {
  const queryClient = useQueryClient();
  const [channels, setChannels] = useState(initial.channels);
  const [levels, setLevels] = useState(initial.budgetLevels.join(", "));
  const [billDays, setBillDays] = useState(initial.billDaysBefore);
  const [large, setLarge] = useState(initial.largeExpenseMinor === null ? "" : formatMinorToMajor(initial.largeExpenseMinor));
  const save = useMutation({
    mutationFn: () =>
      api.setNotificationPrefs(workspaceId, {
        channels,
        budgetLevels: levels.split(/[\s,%]+/).filter(Boolean).map(Number),
        billDaysBefore: billDays,
        largeExpenseMajor: large.trim() || null,
      }),
    onSuccess: (data) => queryClient.setQueryData(["notification-prefs", workspaceId], data),
  });
  // Approvals only happen in shared workspaces.
  const topics = NOTIFICATION_TOPICS.filter((t) => team || t !== "approvals");
  const toggle = (topic: NotificationTopic, channel: "inApp" | "email") => setChannels({ ...channels, [topic]: { ...channels[topic], [channel]: !channels[topic][channel] } });

  return (
    <form
      aria-label="Notification settings"
      className="mt-6 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <table className="w-full surface grain rounded-[var(--r-lg)] text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--muted-foreground)]">
            <th className="p-3 font-normal">Topic</th>
            <th className="p-3 font-normal">In Ledger</th>
            <th className="p-3 font-normal">Email</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t} data-topic={t} className="border-t border-[var(--hairline)]">
              <td className="p-3">{TOPIC_LABEL[t]}</td>
              <td className="p-3"><input type="checkbox" aria-label={`${TOPIC_LABEL[t]} in Ledger`} checked={channels[t].inApp} onChange={() => toggle(t, "inApp")} /></td>
              <td className="p-3"><input type="checkbox" aria-label={`${TOPIC_LABEL[t]} by email`} checked={channels[t].email} onChange={() => toggle(t, "email")} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <fieldset className="space-y-4 surface grain rounded-[var(--r-lg)] p-4 text-sm">
        <legend className="sr-only">Thresholds</legend>
        <label className="flex flex-col gap-1">
          <span>Tell me when a budget reaches</span>
          <input aria-label="Budget levels" placeholder="e.g. 50, 80, 100" value={levels} onChange={(e) => setLevels(e.target.value)} className={`${field} w-48`} />
          <span className="text-xs text-[var(--muted-foreground)]">Percents, up to {MAX_BUDGET_LEVELS}. Leave blank to use each budget&apos;s own alert level. Crossing several at once tells you once, at the highest.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span>Remind me about bills</span>
          <select aria-label="Bill notice" value={billDays} onChange={(e) => setBillDays(Number(e.target.value))} className={`${field} w-48`}>
            {Array.from({ length: MAX_REMINDER_DAYS + 1 }, (_, d) => <option key={d} value={d}>{d === 0 ? "on the day" : `${d} day${d === 1 ? "" : "s"} before`}</option>)}
          </select>
          <span className="text-xs text-[var(--muted-foreground)]">For bills you set up that don&apos;t have their own reminder. Renewals of a quarter or longer still get a week.</span>
        </label>
        <label className="flex flex-col gap-1">
          <span>Tell me about any expense of at least</span>
          <span className="flex items-center gap-2">
            <input aria-label="Large expense amount" inputMode="decimal" placeholder="off" value={large} onChange={(e) => setLarge(e.target.value)} className={`${field} w-36`} />
            <span className="font-mono text-xs text-[var(--muted-foreground)]">{currency}</span>
          </span>
          <span className="text-xs text-[var(--muted-foreground)]">{team ? "Added by anyone else in the workspace." : "Handy for imports and cards shared with others."} Leave blank for none.</span>
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>Save</Button>
        {save.isSuccess ? <span role="status" className="text-sm text-[var(--muted-foreground)]">Saved</span> : null}
      </div>
      {save.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{save.error.message}</p> : null}
    </form>
  );
}
