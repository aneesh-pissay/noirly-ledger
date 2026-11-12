"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { FEED_MONTHS_AHEAD, googleAddUrl, type FeedSettings, type FeedStatus } from "@/src/core/calendar-feed";

const KEY = ["calendar-feed"] as const;

/** Bills and due dates in Google Calendar (or Apple Calendar, Outlook) through a private subscription link. */
export function CalendarFeedScreen() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: KEY, queryFn: () => api.calendarFeed() });
  // The secret is only returned when a link is made, so it lives in memory.
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createCalendarFeed(),
    onSuccess: async (data) => {
      setUrl(data.url);
      setCopied(false);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  const disable = useMutation({
    mutationFn: () => api.disableCalendarFeed(),
    onSuccess: (data) => {
      setUrl(null);
      queryClient.setQueryData(KEY, data);
    },
  });
  const enabled = status.data?.enabled ?? false;
  const busy = create.isPending || disable.isPending;
  const error = create.error ?? disable.error;

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        See bills and due dates in Google Calendar, Apple Calendar or Outlook: each bill on its due date (ticked once paid), and free trials ending and dates to cancel by. It covers last month to {FEED_MONTHS_AHEAD} months ahead, is read-only, and Google refreshes subscribed calendars every few hours.
      </p>

      <section aria-label="Calendar link" className="mt-6 space-y-4 surface grain rounded-[var(--r-lg)] p-4 text-sm">
        {status.isPending ? (
          <p className="text-[var(--muted-foreground)]">Loading…</p>
        ) : url ? (
          <div className="space-y-3">
            <label className="text-xs text-[var(--muted-foreground)]" htmlFor="calendar-feed-url">
              Your private calendar link. Anyone with it can see these bills, so treat it like a password.
            </label>
            <div className="flex gap-2">
              <input id="calendar-feed-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 font-mono text-xs" />
              <Button type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy"}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a href={googleAddUrl(url)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md bg-[var(--accent)] px-4 font-medium text-[var(--accent-ink)]">Add to Google Calendar</a>
              <span className="text-xs text-[var(--muted-foreground)]">Or in Google Calendar: Other calendars → + → From URL, and paste the link.</span>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">This link is shown once. If you lose it, make a new one.</p>
          </div>
        ) : enabled ? (
          <p data-feed-on className="text-[var(--muted-foreground)]">
            A calendar link is on{status.data?.createdAt ? ` (made ${new Date(status.data.createdAt).toLocaleDateString()})` : ""}
            {status.data?.lastFetchedAt ? `, last read by a calendar ${new Date(status.data.lastFetchedAt).toLocaleString()}` : ", not read by a calendar yet"}.
            For your security it can&apos;t be shown again; make a new link to see one, and the old one stops working.
          </p>
        ) : (
          <p className="text-[var(--muted-foreground)]">No calendar link yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {!status.isPending ? (
            <Button type="button" disabled={busy} variant={enabled ? "ghost" : "default"} onClick={() => { if (enabled && !window.confirm("Make a new link? Calendars using the current one will stop updating.")) return; create.mutate(); }}>
              {create.isPending ? "Making link…" : enabled ? "Make a new link" : "Create calendar link"}
            </Button>
          ) : null}
          {enabled ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (window.confirm("Turn off the calendar link? Subscribed calendars will stop updating.")) disable.mutate(); }}>
              {disable.isPending ? "Turning off…" : "Turn off"}
            </Button>
          ) : null}
        </div>
        {error ? <p role="alert" className="text-[var(--balance-negative)]">{error.message}</p> : null}
      </section>

      {status.data ? <ContentsForm initial={status.data} /> : null}
    </PageContainer>
  );
}

function ContentsForm({ initial }: { initial: FeedStatus }) {
  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces() });
  const [settings, setSettings] = useState<FeedSettings>({ workspaceIds: initial.workspaceIds, bills: initial.bills, reminders: initial.reminders, showPaid: initial.showPaid });
  const save = useMutation({ mutationFn: () => api.updateCalendarFeed(settings), onSuccess: (data) => queryClient.setQueryData(KEY, data) });
  const all = settings.workspaceIds.length === 0;
  const list = workspaces.data?.workspaces ?? [];
  const toggle = (id: string) => {
    const current = all ? list.map((w) => w.id) : settings.workspaceIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    // Every one ticked is the same as all, which also takes in workspaces joined later.
    setSettings({ ...settings, workspaceIds: next.length === list.length ? [] : next });
  };

  return (
    <form
      aria-label="What the calendar shows"
      className="mt-6 space-y-4 surface grain rounded-[var(--r-lg)] p-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-xs text-[var(--muted-foreground)]">Show</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.bills} onChange={(e) => setSettings({ ...settings, bills: e.target.checked })} />Bills (recurring, by hand, EMIs, card bills, expenses entered ahead)</label>
        <label className="flex items-center gap-2 pl-6"><input type="checkbox" disabled={!settings.bills} checked={settings.showPaid} onChange={(e) => setSettings({ ...settings, showPaid: e.target.checked })} />Keep paid ones, ticked</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.reminders} onChange={(e) => setSettings({ ...settings, reminders: e.target.checked })} />Free trials ending and dates to cancel by</label>
      </fieldset>
      {list.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs text-[var(--muted-foreground)]">From {all ? "every workspace you're in" : "these workspaces"}</legend>
          {list.map((w) => (
            <label key={w.id} className="flex items-center gap-2">
              <input type="checkbox" checked={all || settings.workspaceIds.includes(w.id)} onChange={() => toggle(w.id)} />
              {w.kind === "personal" ? "Personal" : w.name}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>Save</Button>
        {save.isSuccess ? <span role="status" className="text-[var(--muted-foreground)]">Saved</span> : null}
      </div>
      {save.error ? <p role="alert" className="text-[var(--balance-negative)]">{save.error.message}</p> : null}
    </form>
  );
}
