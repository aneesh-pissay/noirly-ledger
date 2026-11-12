import type { BillItem, BillMarker } from "@/src/core/bills";
import { billKey } from "@/src/core/flow-sync";

/**
 * Bills and due dates as a calendar people subscribe to from Google
 * Calendar, Apple Calendar or Outlook: a private link to a read-only
 * RFC 5545 feed, one all-day event per bill and per trial-end or cancel-by
 * date, across the workspaces they pick.
 */

export type FeedSettings = {
  /** Workspaces in the feed; empty means every one the person is in. */
  workspaceIds: string[];
  bills: boolean;
  reminders: boolean;
  /** Keep paid bills on the calendar (ticked), or drop them once paid. */
  showPaid: boolean;
};

/** The link as its owner sees it: on or off and what it holds, never the secret. */
export type FeedStatus = FeedSettings & { enabled: boolean; createdAt: string | null; lastFetchedAt: string | null };

export const DEFAULT_FEED_SETTINGS: FeedSettings = { workspaceIds: [], bills: true, reminders: true, showPaid: true };

/** How far back and ahead the feed reaches, in months around this one. */
export const FEED_MONTHS_BACK = 1;
export const FEED_MONTHS_AHEAD = 3;

export type FeedEvent = { uid: string; date: string; summary: string; description: string; url: string };

const STATUS_MARK: Record<BillItem["status"], string> = { paid: "✓ ", overdue: "Overdue: ", due: "", upcoming: "" };

export function billEvent(item: BillItem, money: (minor: number, currency: string) => string, workspaceName: string, url: string): FeedEvent {
  const name = item.merchant ?? item.note ?? "A bill";
  const amount = money(item.amountMinor, item.currency);
  return {
    uid: `${billKey(item)}`,
    date: item.date,
    summary: `${STATUS_MARK[item.status]}${name} · ${amount}`,
    description: [
      `${item.status === "paid" ? "Paid" : item.status === "overdue" ? "Overdue, not paid yet" : "To pay"}: ${amount}.`,
      item.note && item.note !== name ? item.note : null,
      `Noirly Ledger · ${workspaceName}`,
      url,
    ].filter(Boolean).join("\n"),
    url,
  };
}

export function markerEvent(marker: BillMarker, workspaceName: string, url: string): FeedEvent {
  const name = marker.name ?? "a subscription";
  return {
    uid: `${marker.kind}:${marker.ruleId}:${marker.date}`,
    date: marker.date,
    summary: marker.kind === "trial" ? `Free trial of ${name} ends` : `Cancel ${name}`,
    description: [marker.kind === "trial" ? "Decide whether to keep it before it turns into a charge." : "The date you meant to cancel by.", `Noirly Ledger · ${workspaceName}`, url].join("\n"),
    url,
  };
}

/** Which of a month's bills go in the feed. */
export function feedItems(items: BillItem[], settings: Pick<FeedSettings, "bills" | "showPaid">) {
  if (!settings.bills) return [];
  return settings.showPaid ? items : items.filter((i) => i.status !== "paid");
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newlines are escaped. */
export function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** RFC 5545 §3.1: lines over 75 octets continue on the next line after a space. */
export function foldLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function compact(date: string) {
  return date.replace(/-/g, "");
}

function nextDay(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The feed: all-day, transparent events (a bill shouldn't block anyone's time). */
export function buildCalendar(input: { name: string; host: string; stamp: Date; events: FeedEvent[] }) {
  const stamp = input.stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Noirly//Ledger//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name)}`,
    "X-WR-CALDESC:Bills and due dates from Noirly Ledger",
    // A hint only; Google refreshes subscribed calendars on its own schedule.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  const seen = new Set<string>();
  for (const event of input.events) {
    if (seen.has(event.uid)) continue;
    seen.add(event.uid);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@${input.host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(event.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(event.date))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `URL:${event.url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Google opens its "Add calendar" dialog for a subscription link passed as `cid`. */
export function googleAddUrl(feedUrl: string) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https?:/, "webcal:"))}`;
}
