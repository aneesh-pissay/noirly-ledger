/**
 * The workspace a receipt belongs to, read from its storage key
 * (`<workspaceId>/<file>` on disk, `ledger/receipts/<workspaceId>/<file>` in R2),
 * or null for a key that isn't a receipt key.
 */
export function receiptWorkspaceId(key: string): string | null {
  if (key.includes("..") || key.includes("\\")) return null;
  const match = /^(?:ledger\/receipts\/)?([a-f0-9]{24})\/[A-Za-z0-9._-]+$/.exec(key);
  return match ? match[1]! : null;
}

/** Receipts are only ever served through the member-checked route, never a public URL. */
export function receiptUrlFor(key: string): string {
  return `/api/receipts/${key}`;
}
