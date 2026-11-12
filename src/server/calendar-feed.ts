import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { CalendarFeed, Workspace, WorkspaceMember } from "@/src/server/models";
import { getBillCalendar } from "@/src/server/bills";
import { formatMoney } from "@/src/core/locale-format";
import { shiftMonth } from "@/src/core/bills";
import { billEvent, buildCalendar, DEFAULT_FEED_SETTINGS, FEED_MONTHS_AHEAD, FEED_MONTHS_BACK, feedItems, markerEvent, type FeedEvent, type FeedSettings, type FeedStatus } from "@/src/core/calendar-feed";

/** Calendar apps poll often; one fetch in this long is counted. */
const FETCH_NOTE_MS = 60 * 60_000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appOrigin() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL;
  if (!base) throw new Error("App origin is not configured");
  return new URL(base).origin;
}

export function feedUrl(token: string) {
  return `${appOrigin()}/api/calendar/${token}.ics`;
}

function statusOf(doc: { tokenHash?: string | null; linkCreatedAt?: Date | null; lastFetchedAt?: Date | null; workspaceIds?: Types.ObjectId[]; bills?: boolean; reminders?: boolean; showPaid?: boolean } | null): FeedStatus {
  if (!doc) return { ...DEFAULT_FEED_SETTINGS, enabled: false, createdAt: null, lastFetchedAt: null };
  return {
    workspaceIds: (doc.workspaceIds ?? []).map(String),
    bills: doc.bills ?? true,
    reminders: doc.reminders ?? true,
    showPaid: doc.showPaid ?? true,
    enabled: Boolean(doc.tokenHash),
    createdAt: doc.tokenHash && doc.linkCreatedAt ? doc.linkCreatedAt.toISOString() : null,
    lastFetchedAt: doc.tokenHash && doc.lastFetchedAt ? doc.lastFetchedAt.toISOString() : null,
  };
}

export function getFeedStatus(userId: string) {
  return withDb(async () => statusOf(await CalendarFeed.findOne({ userId: new Types.ObjectId(userId) }).lean()));
}

/** Makes the link, or replaces it: the old one stops working at once. The secret is only ever shown here. */
export function rotateFeed(userId: string) {
  return withDb(async () => {
    const token = randomBytes(32).toString("base64url");
    const createdAt = new Date();
    await CalendarFeed.updateOne(
      { userId: new Types.ObjectId(userId) },
      { $set: { tokenHash: hashToken(token), linkCreatedAt: createdAt, lastFetchedAt: null } },
      { upsert: true },
    );
    return { url: feedUrl(token), createdAt: createdAt.toISOString() };
  });
}

export function disableFeed(userId: string) {
  return withDb(async () => {
    await CalendarFeed.updateOne({ userId: new Types.ObjectId(userId) }, { $set: { tokenHash: null, linkCreatedAt: null, lastFetchedAt: null } });
    return statusOf(await CalendarFeed.findOne({ userId: new Types.ObjectId(userId) }).lean());
  });
}

/** What's in the feed; only workspaces the person is in. */
export function updateFeedSettings(userId: string, settings: FeedSettings) {
  return withDb(async () => {
    if (!settings.bills && !settings.reminders) throw new ApiError(400, "invalid_request", "Pick bills, reminders or both");
    const ids = [...new Set(settings.workspaceIds)];
    if (ids.some((id) => !Types.ObjectId.isValid(id))) throw new ApiError(400, "invalid_request", "Invalid workspace");
    const found = await WorkspaceMember.countDocuments({ userId: new Types.ObjectId(userId), workspaceId: { $in: ids.map((id) => new Types.ObjectId(id)) } });
    if (found !== ids.length) throw new ApiError(400, "invalid_request", "You can only add workspaces you're in");
    const doc = await CalendarFeed.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: { workspaceIds: ids.map((id) => new Types.ObjectId(id)), bills: settings.bills, reminders: settings.reminders, showPaid: settings.showPaid } },
      { upsert: true, returnDocument: "after" },
    ).lean();
    return statusOf(doc);
  });
}

/**
 * The calendar behind a feed link, or null for an unknown or turned-off
 * one: bills and dates from last month to a few months ahead, in the
 * picked workspaces the person is still in.
 */
export function renderFeed(token: string, now = new Date()): Promise<string | null> {
  return withDb(async () => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const feed = await CalendarFeed.findOne({ tokenHash: hashToken(token) }).lean();
    if (!feed) return null;
    const userId = String(feed.userId);

    const memberships = await WorkspaceMember.find({ userId: feed.userId }).select("workspaceId").lean();
    const picked = new Set(feed.workspaceIds.map(String));
    const workspaceIds = memberships.map((m) => String(m.workspaceId)).filter((id) => !picked.size || picked.has(id));
    const workspaces = await Workspace.find({ _id: { $in: workspaceIds.map((id) => new Types.ObjectId(id)) } }).select("name kind").lean();

    const origin = appOrigin();
    const thisMonth = now.toISOString().slice(0, 7);
    const months = Array.from({ length: FEED_MONTHS_BACK + FEED_MONTHS_AHEAD + 1 }, (_, i) => shiftMonth(thisMonth, i - FEED_MONTHS_BACK));
    const events: FeedEvent[] = [];
    for (const workspace of workspaces) {
      const id = String(workspace._id);
      const name = workspace.kind === "personal" ? "Personal" : workspace.name;
      const url = `${origin}${workspace.kind === "personal" ? "/recurring" : `/w/${id}/transactions`}`;
      for (const month of months) {
        const calendar = await getBillCalendar(userId, id, month);
        for (const item of feedItems(calendar.items, feed)) events.push(billEvent(item, formatMoney, name, url));
        if (feed.reminders) for (const marker of calendar.markers) events.push(markerEvent(marker, name, url));
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary));

    if (!feed.lastFetchedAt || now.getTime() - feed.lastFetchedAt.getTime() > FETCH_NOTE_MS) {
      await CalendarFeed.updateOne({ _id: feed._id }, { $set: { lastFetchedAt: now } });
    }
    return buildCalendar({ name: "Noirly Ledger bills", host: new URL(origin).host, stamp: now, events });
  });
}
