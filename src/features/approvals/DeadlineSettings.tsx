"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/src/lib/api-client";
import type { DeadlineSettings as Settings } from "@/src/core/deadlines";

const field = "h-9 w-20 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

/** A number field that may be left empty (off). */
function days(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return value.trim() === "" || Number.isNaN(n) ? null : n;
}

const text = (n: number | null) => (n === null ? "" : String(n));

/**
 * When expenses must be submitted, and when waiting approvals are chased:
 * a reminder to whoever can decide, then escalation to the owners. The
 * daily run does the chasing. Owners set these; everyone sees them.
 */
export function DeadlineSettings({ workspaceId, settings, canManage }: { workspaceId: string; settings: Settings; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    submitWithinDays: text(settings.submitWithinDays),
    monthCloseDay: text(settings.monthCloseDay),
    lateSubmission: settings.lateSubmission,
    remindAfterDays: text(settings.remindAfterDays),
    escalateAfterDays: text(settings.escalateAfterDays),
  });
  const save = useMutation({
    mutationFn: () =>
      api.updateWorkspaceSettings(workspaceId, {
        approvalDeadlines: {
          submitWithinDays: days(form.submitWithinDays),
          monthCloseDay: days(form.monthCloseDay),
          lateSubmission: form.lateSubmission,
          remindAfterDays: days(form.remindAfterDays),
          escalateAfterDays: days(form.escalateAfterDays),
        },
      }),
    onSuccess: () => router.refresh(),
  });

  return (
    <section aria-label="Deadlines" className="surface grain mt-8 space-y-4 rounded-[var(--r-lg)] p-4">
      <div>
        <h2 className="text-sm font-medium">Deadlines</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Leave a box empty to turn it off. Waiting approvals are checked once a day: first the approvers are reminded, then the step is escalated so owners can decide it too.
        </p>
      </div>
      <form
        aria-label="Deadline settings"
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset disabled={!canManage} className="space-y-2">
          <legend className="mb-1 text-xs text-[var(--muted-foreground)]">Submitting</legend>
          <label className="flex flex-wrap items-center gap-2">
            Within
            <input aria-label="Submit within days" inputMode="numeric" value={form.submitWithinDays} onChange={(e) => setForm({ ...form, submitWithinDays: e.target.value })} className={field} />
            days of spending
          </label>
          <label className="flex flex-wrap items-center gap-2">
            and by day
            <input aria-label="Month closes on day" inputMode="numeric" value={form.monthCloseDay} onChange={(e) => setForm({ ...form, monthCloseDay: e.target.value })} className={field} />
            of the next month
          </label>
          <label className="flex flex-wrap items-center gap-2">
            Late ones are
            <select aria-label="Late submissions" value={form.lateSubmission} onChange={(e) => setForm({ ...form, lateSubmission: e.target.value as "flag" | "block" })} className="h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm">
              <option value="flag">flagged for approvers</option>
              <option value="block">refused</option>
            </select>
          </label>
        </fieldset>
        <fieldset disabled={!canManage} className="space-y-2">
          <legend className="mb-1 text-xs text-[var(--muted-foreground)]">Approving</legend>
          <label className="flex flex-wrap items-center gap-2">
            Remind approvers after
            <input aria-label="Remind after days" inputMode="numeric" value={form.remindAfterDays} onChange={(e) => setForm({ ...form, remindAfterDays: e.target.value })} className={field} />
            days waiting
          </label>
          <label className="flex flex-wrap items-center gap-2">
            Escalate to owners after
            <input aria-label="Escalate after days" inputMode="numeric" value={form.escalateAfterDays} onChange={(e) => setForm({ ...form, escalateAfterDays: e.target.value })} className={field} />
            days waiting
          </label>
        </fieldset>
        {canManage ? (
          <button type="submit" disabled={save.isPending} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]">
            {save.isSuccess && !save.isPending ? "Saved" : "Save deadlines"}
          </button>
        ) : null}
      </form>
      {save.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{save.error.message}</p> : null}
    </section>
  );
}
