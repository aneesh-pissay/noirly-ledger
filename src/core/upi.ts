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

/**
 * Apps a payment link can open. "any" is the standard upi://pay link, which
 * the phone hands to whichever UPI app the person picks; the rest open one
 * app directly. Links only work on a phone with the app installed.
 */
export const UPI_APPS = {
  any: { label: "Any UPI app", prefix: "upi://pay" },
  gpay: { label: "Google Pay", prefix: "tez://upi/pay" },
  phonepe: { label: "PhonePe", prefix: "phonepe://pay" },
  paytm: { label: "Paytm", prefix: "paytmmp://pay" },
} as const;
export type UpiApp = keyof typeof UPI_APPS;

/** Characters kept as they are in a link's values: UPI apps read "@" in a UPI ID literally. */
function encode(value: string) {
  return encodeURIComponent(value).replace(/%40/g, "@");
}

/**
 * A link that opens a UPI app ready to pay: to the UPI ID, in rupees (UPI
 * pays in INR only), with the amount and a note filled in when given.
 */
export function upiPayLink(input: { upiId: string; payeeName?: string | null; amountMinor?: number | null; note?: string | null }, app: UpiApp = "any") {
  const params: Array<[string, string]> = [["pa", input.upiId]];
  if (input.payeeName) params.push(["pn", input.payeeName.slice(0, 50)]);
  if (input.amountMinor != null && input.amountMinor > 0) params.push(["am", (input.amountMinor / 100).toFixed(2)]);
  params.push(["cu", "INR"]);
  if (input.note) params.push(["tn", input.note.slice(0, 50)]);
  return `${UPI_APPS[app].prefix}?${params.map(([k, v]) => `${k}=${encode(v)}`).join("&")}`;
}
