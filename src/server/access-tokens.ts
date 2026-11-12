import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { AccessToken, LedgerUser, type AccessTokenDocument } from "@/src/server/models";
import { MAX_TOKENS, tokenHint, tokenScope, type AccessTokenView, type TokenScope } from "@/src/core/access-tokens";

const DAY_MS = 86_400_000;
/** lastUsedAt is written at most this often per token. */
const TOUCH_MS = 60_000;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

function view(doc: AccessTokenDocument): AccessTokenView {
  return {
    id: String(doc._id),
    name: doc.name,
    scope: doc.scope as TokenScope,
    hint: doc.hint,
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt ? doc.expiresAt.toISOString() : null,
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
  };
}

const live = () => ({ revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] });

/** Your live tokens, newest first. */
export function listAccessTokens(userId: string) {
  return withDb(async () => {
    const docs = await AccessToken.find({ userId: new Types.ObjectId(userId), ...live() }).sort({ createdAt: -1 }).lean();
    return docs.map((doc) => view(doc as AccessTokenDocument));
  });
}

/** Makes a token. The secret is returned once and never stored. `days` 0 means no expiry. */
export function createAccessToken(userId: string, input: { name: string; scope: TokenScope; days: number }) {
  return withDb(async () => {
    const owner = new Types.ObjectId(userId);
    if ((await AccessToken.countDocuments({ userId: owner, ...live() })) >= MAX_TOKENS) {
      throw new ApiError(400, "limit_reached", `You can have up to ${MAX_TOKENS} tokens. Revoke one first.`);
    }
    const token = `nlp_${input.scope === "read" ? "r" : "w"}_${randomBytes(32).toString("base64url")}`;
    const doc = await AccessToken.create({
      userId: owner,
      name: input.name,
      scope: input.scope,
      tokenHash: hash(token),
      hint: tokenHint(token),
      expiresAt: input.days ? new Date(Date.now() + input.days * DAY_MS) : null,
    });
    return { token, accessToken: view(doc.toObject()) };
  });
}

export function revokeAccessToken(userId: string, tokenId: string) {
  return withDb(async () => {
    if (!Types.ObjectId.isValid(tokenId)) throw new ApiError(404, "not_found", "Token not found");
    const result = await AccessToken.updateOne(
      { _id: new Types.ObjectId(tokenId), userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (!result.matchedCount) throw new ApiError(404, "not_found", "Token not found");
  });
}

/** The account behind a live token, as the sign-in would describe it, or a 401. */
export function resolveAccessToken(token: string) {
  return withDb(async () => {
    const scope = tokenScope(token);
    const doc = scope ? await AccessToken.findOne({ tokenHash: hash(token), ...live() }).lean() : null;
    // The scope letter is inside the hash, but check it agrees anyway.
    if (!doc || doc.scope !== scope) throw new ApiError(401, "unauthorized", "Invalid, expired or revoked token");
    const user = await LedgerUser.findById(doc.userId).lean();
    if (!user) throw new ApiError(401, "unauthorized", "Invalid, expired or revoked token");
    if (!doc.lastUsedAt || Date.now() - doc.lastUsedAt.getTime() > TOUCH_MS) {
      await AccessToken.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } });
    }
    return {
      scope: doc.scope as TokenScope,
      // As the Identity sign-in last left the account, so resolving it changes nothing.
      user: { id: user.identitySub, email: user.emailVerified ? user.email : null, name: user.displayName, image: user.avatarUrl ?? null },
    };
  });
}
