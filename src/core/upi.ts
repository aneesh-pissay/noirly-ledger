/**
 * UPI details on a transaction: the payment's reference number (the 12-digit
 * UPI reference, also called RRN or UTR, that apps show after paying) and the
 * UPI ID it was paid to or from (name@bank). A reference is one payment, so
 * the same one can't be recorded twice in a workspace.
 */

/** A UPI reference as stored: its 12 digits, with any spaces or dashes taken out; null when empty. Throws when it isn't 12 digits. */
export function normalizeUpiRef(text: string | null | undefined): string | null {
  const digits = (text ?? "").replace(/[\s-]/g, "");
  if (!digits) return null;
  if (!/^\d{12}$/.test(digits)) throw new Error("A UPI reference is 12 digits, like 4321 5678 9012");
  return digits;
}

/** A UPI ID as stored: lowercase, trimmed; null when empty. Throws when it doesn't look like name@bank. */
export function normalizeUpiId(text: string | null | undefined): string | null {
  const id = (text ?? "").trim().toLowerCase();
  if (!id) return null;
  if (!/^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,31}$/.test(id)) throw new Error("A UPI ID looks like name@bank");
  return id;
}

/** A reference shown in groups of four, as payment apps do. */
export function formatUpiRef(ref: string) {
  return ref.replace(/(\d{4})(?=\d)/g, "$1 ");
}
