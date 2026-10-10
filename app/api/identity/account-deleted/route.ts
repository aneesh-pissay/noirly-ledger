import { createRemoteJWKSet, jwtVerify } from "jose";
import { identityUrl } from "@/src/server/auth/identity-url";
import { withDb } from "@/src/server/db/mongodb";
import { deleteLedgerAccountData } from "@/src/server/users/delete-account";

/**
 * Noirly Identity calls this when someone deletes their Noirly account (from
 * the web, or from another app), so their Ledger data goes too.
 *
 * The body is a Security Event Token: a JWT signed with Identity's OIDC key,
 * `aud` = this app's client id (AUTH_NOIRLY_CLIENT_ID), `sub` = the deleted
 * user. Deletion is idempotent, so a replayed notice does no harm.
 * Register it in Identity: ACCOUNT_DELETION_WEBHOOKS=<client id>=<this URL>.
 */

const ACCOUNT_DELETED_EVENT = "https://noirly.dev/events/account-deleted";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function identityKeys() {
  jwks ??= createRemoteJWKSet(new URL(`${identityUrl()}/.well-known/jwks.json`));
  return jwks;
}

export async function POST(request: Request) {
  const audience = process.env.AUTH_NOIRLY_CLIENT_ID;
  if (!audience) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  let sub: string;
  try {
    const token = (await request.text()).trim();
    const { payload } = await jwtVerify(token, identityKeys(), {
      issuer: identityUrl(),
      audience,
      typ: "secevent+jwt",
      algorithms: ["RS256"],
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (!payload.sub || !events || !(ACCOUNT_DELETED_EVENT in events)) {
      return Response.json({ error: "invalid_event" }, { status: 400 });
    }
    sub = payload.sub;
  } catch {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }

  try {
    const summary = await withDb(() => deleteLedgerAccountData(sub));
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("Ledger account deletion failed", error);
    // Identity keeps the notice and retries later.
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
