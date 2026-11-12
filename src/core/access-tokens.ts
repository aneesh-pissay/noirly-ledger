/**
 * Personal access tokens, for scripts and other apps calling Ledger's API as
 * you, look like `nlp_r_<secret>` (read only) or `nlp_w_<secret>` (read and
 * write), as Flow's do. The scope letter is part of the hashed token, so it
 * can't be changed without breaking the token; the proxy reads it to turn
 * away writes from read-only tokens before any lookup.
 */
export type TokenScope = "read" | "write";

export const TOKEN_PREFIX = "nlp_";
export const MAX_TOKENS = 20;
export const TOKEN_EXPIRY_DAYS = [30, 90, 365, 0] as const;

const PATTERN = /^nlp_([rw])_[A-Za-z0-9_-]{32,64}$/;

/** The scope a token claims, or null when it isn't one of ours. */
export function tokenScope(token: string): TokenScope | null {
  const match = PATTERN.exec(token);
  if (!match) return null;
  return match[1] === "r" ? "read" : "write";
}

export function isAccessToken(token: string) {
  return token.startsWith(TOKEN_PREFIX);
}

/** What the token list shows: enough to recognise a token, never enough to use it. */
export function tokenHint(token: string) {
  return `${token.slice(0, 10)}…${token.slice(-4)}`;
}

/** A read-only token may only read. */
export function scopeAllows(scope: TokenScope, method: string) {
  return scope === "write" || ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export type AccessTokenView = {
  id: string;
  name: string;
  scope: TokenScope;
  hint: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};
