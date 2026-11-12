import { bearerMatches } from "@/src/server/security/bearer";
import { MAX_EMAIL_BYTES, receiveEmail } from "@/src/server/inbound-email";

export const runtime = "nodejs";

/**
 * POST /api/inbound-email — a raw email (RFC 822) from the inbound relay,
 * with `Authorization: Bearer <INBOUND_EMAIL_SECRET>` and, if the relay
 * knows it, the envelope recipient as `?to=`. Anything it processed gets a
 * 200, taken or not, so the relay doesn't retry mail Ledger turned down.
 */
export async function POST(request: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "not_found" }, { status: 404 });
  if (!bearerMatches(request.headers.get("authorization"), secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_EMAIL_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  try {
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.byteLength > MAX_EMAIL_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
    if (!raw.byteLength) return Response.json({ error: "invalid_request", message: "Send the raw email as the body" }, { status: 400 });
    const to = new URL(request.url).searchParams.get("to");
    return Response.json(await receiveEmail(raw, to));
  } catch {
    console.error("Inbound email failed");
    // A 5xx lets the relay try again later.
    return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
}
