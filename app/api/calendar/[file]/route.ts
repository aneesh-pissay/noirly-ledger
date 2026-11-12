import { renderFeed } from "@/src/server/calendar-feed";

/**
 * GET /api/calendar/<secret>.ics — the feed calendar apps subscribe to.
 * No session: the unguessable secret is the credential, so an unknown or
 * turned-off one gets the same 404 as a malformed one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  try {
    const { file } = await params;
    const body = await renderFeed(file.endsWith(".ics") ? file.slice(0, -4) : file);
    if (body === null) return new Response("Not found", { status: 404 });
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="noirly-ledger.ics"',
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    console.error("Calendar feed failed");
    return new Response("Calendar unavailable", { status: 503 });
  }
}
