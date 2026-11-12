import { getLedgerProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { calendarFeedBodySchema } from "@/src/core/schemas/ledger";
import { disableFeed, getFeedStatus, rotateFeed, updateFeedSettings } from "@/src/server/calendar-feed";

/** Your calendar link: whether it's on and what it holds (never the link itself). */
export async function GET() {
  try {
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Your calendar link");
    return jsonOk(await getFeedStatus(ctx.userId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Makes a new link, shown once; any old one stops working. */
export async function POST() {
  try {
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Your calendar link");
    return jsonOk(await rotateFeed(ctx.userId), 201);
  } catch (error) {
    return jsonError(error);
  }
}

/** What the calendar holds. */
export async function PUT(request: Request) {
  try {
    const body = calendarFeedBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Your calendar link");
    return jsonOk(await updateFeedSettings(ctx.userId, body));
  } catch (error) {
    return jsonError(error);
  }
}

/** Turns the link off. */
export async function DELETE() {
  try {
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Your calendar link");
    return jsonOk(await disableFeed(ctx.userId));
  } catch (error) {
    return jsonError(error);
  }
}
