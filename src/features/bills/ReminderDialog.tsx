"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Input, Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { DEFAULT_REMINDER_DAYS, RENEWAL_NOTICE_DAYS, type ReminderSettings } from "@/src/core/reminders";
import { Select } from "@/src/components/Select";

type Props = {
  workspaceId: string;
  /** The recurring rule being set up, or null when closed. */
  rule: { id: string; name: string; settings: ReminderSettings | null } | null;
  onClose: () => void;
};

const NOTICE = ["default", "off", "0", "1", "2", "3", "5", "7", "14"] as const;

/** How a recurring bill's reminders read in a list. */
export function describeReminders(settings: ReminderSettings | null | undefined) {
  if (!settings) return null;
  const parts = [
    settings.daysBefore == null ? "No reminder" : settings.daysBefore === 0 ? "Reminds on the day" : `Reminds ${settings.daysBefore} day${settings.daysBefore === 1 ? "" : "s"} before`,
    settings.trialEndsOn ? `trial ends ${settings.trialEndsOn}` : null,
    settings.cancelBy ? `cancel by ${settings.cancelBy}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** A recurring bill's reminders: notice before each charge, a free trial's end, and a date to cancel by. */
export function ReminderDialog({ workspaceId, rule, onClose }: Props) {
  return (
    <Dialog open={Boolean(rule)} title={rule ? `Reminders for ${rule.name}` : "Reminders"} onClose={onClose}>
      {rule ? <ReminderForm key={rule.id} workspaceId={workspaceId} rule={rule} onClose={onClose} /> : null}
    </Dialog>
  );
}

function ReminderForm({ workspaceId, rule, onClose }: { workspaceId: string; rule: NonNullable<Props["rule"]>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const s = rule.settings;
  const [notice, setNotice] = useState<string>(s ? (s.daysBefore == null ? "off" : String(s.daysBefore)) : "default");
  const [trialEndsOn, setTrialEndsOn] = useState(s?.trialEndsOn ?? "");
  const [cancelBy, setCancelBy] = useState(s?.cancelBy ?? "");
  const save = useMutation({
    mutationFn: () => {
      const untouched = notice === "default" && !trialEndsOn && !cancelBy;
      return api.setReminders(
        rule.id,
        untouched
          ? null
          : { daysBefore: notice === "off" ? null : notice === "default" ? DEFAULT_REMINDER_DAYS : Number(notice), trialEndsOn: trialEndsOn || null, cancelBy: cancelBy || null },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bills", workspaceId] });
      onClose();
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <Label htmlFor="reminder-notice">Remind me</Label>
        <Select id="reminder-notice" value={notice} onChange={(e) => setNotice(e.target.value)}>
          {NOTICE.map((value) => (
            <option key={value} value={value}>
              {value === "default"
                ? `${DEFAULT_REMINDER_DAYS} days before (a week for yearly renewals)`
                : value === "off"
                  ? "Don't remind me"
                  : value === "0"
                    ? "On the day"
                    : `${value} day${value === "1" ? "" : "s"} before`}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Charges every three months or less often count as renewals and get at least {RENEWAL_NOTICE_DAYS} days&apos; notice.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="reminder-trial">Free trial ends on</Label>
          <Input id="reminder-trial" type="date" value={trialEndsOn} onChange={(e) => setTrialEndsOn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="reminder-cancel">Cancel by</Label>
          <Input id="reminder-cancel" type="date" value={cancelBy} onChange={(e) => setCancelBy(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Trial and cancel-by reminders come a few days ahead and again on the day.</p>
      {save.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{save.error.message}</p> : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save reminders"}</Button>
      </div>
    </form>
  );
}
