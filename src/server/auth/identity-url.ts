/**
 * Public Noirly Identity origin, resolved on the server at request time.
 * Prefers NEXT_PUBLIC_IDENTITY_URL, then the OIDC issuer Ledger already signs
 * in against, so production works even when the public variable was missing
 * from the build.
 */
export function identityUrl(): string {
  return (
    process.env.NEXT_PUBLIC_IDENTITY_URL ||
    process.env.AUTH_NOIRLY_ISSUER ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
