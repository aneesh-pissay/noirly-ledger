import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time check of an `Authorization: Bearer <secret>` header. */
export function bearerMatches(header: string | null, secret: string): boolean {
  // Hashing first gives equal-length inputs, so length doesn't leak either.
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const supplied = createHash("sha256").update(header ?? "").digest();
  return timingSafeEqual(expected, supplied);
}
