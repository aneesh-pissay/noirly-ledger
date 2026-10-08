import { withDb } from "@/src/server/db/mongodb";
import { LedgerUser } from "@/src/server/models";

/**
 * Server-side sign-out for stateless JWT sessions.
 *
 * Auth.js re-issues the session cookie on every proxied response, so a request
 * that was in flight when the user signed out (a sidebar prefetch, the
 * notification poll) used to put a valid cookie straight back. Recording the
 * sign-out time on the user and refusing any session that started before it
 * closes that, and makes a copied cookie useless after sign-out.
 *
 * The check runs on every request through proxy.ts, so the lookup is cached
 * briefly. Sign-out updates the cache in this process at once.
 */
const TTL_MS = 15_000;
const cache = new Map<string, { revokedAt: number; checkedAt: number }>();

async function revokedAtFor(identitySub: string): Promise<number> {
  const hit = cache.get(identitySub);
  if (hit && Date.now() - hit.checkedAt < TTL_MS) return hit.revokedAt;
  const user = await withDb(() =>
    LedgerUser.findOne({ identitySub }).select({ sessionsRevokedAt: 1 }).lean(),
  );
  const revokedAt = user?.sessionsRevokedAt ? new Date(user.sessionsRevokedAt).getTime() : 0;
  cache.set(identitySub, { revokedAt, checkedAt: Date.now() });
  return revokedAt;
}

/** True when a session that signed in at `signedInAt` (ms) has since been signed out. */
export async function isSessionRevoked(identitySub: string, signedInAt: number): Promise<boolean> {
  const revokedAt = await revokedAtFor(identitySub);
  return revokedAt > 0 && signedInAt <= revokedAt;
}

export async function revokeSessions(identitySub: string): Promise<void> {
  const now = new Date();
  cache.set(identitySub, { revokedAt: now.getTime(), checkedAt: Date.now() });
  await withDb(() => LedgerUser.updateOne({ identitySub }, { $set: { sessionsRevokedAt: now } }));
}
