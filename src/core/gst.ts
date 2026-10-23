/**
 * GST on transactions (India). A transaction's amount is what was paid, tax
 * included; GST details say how much of it was tax. Within a state the tax is
 * split equally into CGST and SGST; between states it's all IGST. A tax
 * treatment marks what isn't taxed (exempt, nil-rated, zero-rated, outside
 * GST). The supplier's GSTIN is checked against its check digit.
 */

/** Rates in use, including the 40% rate for sin and luxury goods and the small rates for gold and diamonds. */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;

export const GST_TREATMENTS = ["taxable", "exempt", "nil_rated", "zero_rated", "non_gst"] as const;
export type GstTreatment = (typeof GST_TREATMENTS)[number];

export const GST_TREATMENT_LABEL: Record<GstTreatment, string> = {
  taxable: "Taxable",
  exempt: "Exempt",
  nil_rated: "Nil-rated",
  zero_rated: "Zero-rated (exports)",
  non_gst: "Outside GST",
};

export const GST_SUPPLIES = ["intra", "inter"] as const;
export type GstSupply = (typeof GST_SUPPLIES)[number];

export const GST_SUPPLY_LABEL: Record<GstSupply, string> = {
  intra: "Same state (CGST + SGST)",
  inter: "Another state (IGST)",
};

export type GstSettings = {
  ratePct: number;
  treatment: GstTreatment;
  supply: GstSupply;
  gstin?: string | null;
  hsn?: string | null;
  /** Business purchases: whether the tax can be claimed back as input tax credit. */
  itcEligible?: boolean;
};

export type GstAmounts = { taxableMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number; taxMinor: number };

/** How much of an amount (tax included) is taxable value and how much is tax, split by supply. */
export function gstAmounts(amountMinor: number, settings: Pick<GstSettings, "ratePct" | "treatment" | "supply">): GstAmounts {
  const rate = settings.treatment === "taxable" ? settings.ratePct : 0;
  const taxableMinor = Math.round((amountMinor * 100) / (100 + rate));
  const taxMinor = amountMinor - taxableMinor;
  if (settings.supply === "inter") return { taxableMinor, cgstMinor: 0, sgstMinor: 0, igstMinor: taxMinor, taxMinor };
  const cgstMinor = Math.round(taxMinor / 2);
  return { taxableMinor, cgstMinor, sgstMinor: taxMinor - cgstMinor, igstMinor: 0, taxMinor };
}

/** What an amount before tax comes to with tax added, for entering prices that exclude GST. */
export function withGst(beforeTaxMinor: number, ratePct: number) {
  return beforeTaxMinor + Math.round((beforeTaxMinor * ratePct) / 100);
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The check character a GSTIN's first 14 characters call for. */
export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]!);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
}

/** A GSTIN as stored (uppercase, no spaces), or null when empty. Throws when its shape or check character is wrong. */
export function normalizeGstin(text: string | null | undefined): string | null {
  const gstin = (text ?? "").replace(/\s/g, "").toUpperCase();
  if (!gstin) return null;
  if (!/^(0[1-9]|[1-3][0-9])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    throw new Error("A GSTIN is 15 characters, like 27AAPFU0939F1ZV");
  }
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) throw new Error("That GSTIN's last character doesn't check out; look for a typo");
  return gstin;
}

/** An HSN or SAC code as stored: 4 to 8 digits; null when empty. */
export function normalizeHsn(text: string | null | undefined): string | null {
  const code = (text ?? "").replace(/\s/g, "");
  if (!code) return null;
  if (!/^\d{4,8}$/.test(code)) throw new Error("An HSN or SAC code is 4 to 8 digits");
  return code;
}

export function checkGstSettings(settings: GstSettings): { ok: true } | { ok: false; error: string } {
  if (!(GST_RATES as readonly number[]).includes(settings.ratePct)) return { ok: false, error: `GST rates are ${GST_RATES.join(", ")}%` };
  if (settings.treatment !== "taxable" && settings.ratePct !== 0) return { ok: false, error: "Only taxable supplies have a GST rate" };
  return { ok: true };
}

type SummaryRow = { type: string; currency: string; gst: (GstAmounts & { ratePct: number; treatment: GstTreatment; itcEligible?: boolean }) | null };

/**
 * GST over some transactions, per currency: taxable value and tax paid on
 * spending (less refunds), and collected on income, by rate; and how much
 * paid tax can be claimed as input tax credit.
 */
export function gstSummary(rows: SummaryRow[]) {
  type Bucket = { taxableMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number; taxMinor: number };
  const empty = (): Bucket => ({ taxableMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, taxMinor: 0 });
  const byCurrency = new Map<string, { paid: Bucket; collected: Bucket; itcMinor: number; byRate: Map<number, { paid: Bucket; collected: Bucket }> }>();
  for (const row of rows) {
    if (!row.gst || row.type === "transfer") continue;
    const sign = row.type === "refund" ? -1 : 1;
    const side = row.type === "income" ? "collected" : "paid";
    const entry = byCurrency.get(row.currency) ?? { paid: empty(), collected: empty(), itcMinor: 0, byRate: new Map() };
    const rate = entry.byRate.get(row.gst.ratePct) ?? { paid: empty(), collected: empty() };
    for (const bucket of [entry[side], rate[side]]) {
      bucket.taxableMinor += sign * row.gst.taxableMinor;
      bucket.cgstMinor += sign * row.gst.cgstMinor;
      bucket.sgstMinor += sign * row.gst.sgstMinor;
      bucket.igstMinor += sign * row.gst.igstMinor;
      bucket.taxMinor += sign * row.gst.taxMinor;
    }
    if (side === "paid" && row.gst.itcEligible) entry.itcMinor += sign * row.gst.taxMinor;
    entry.byRate.set(row.gst.ratePct, rate);
    byCurrency.set(row.currency, entry);
  }
  return [...byCurrency.entries()].map(([currency, entry]) => ({
    currency,
    paid: entry.paid,
    collected: entry.collected,
    itcMinor: entry.itcMinor,
    byRate: [...entry.byRate.entries()].sort(([a], [b]) => a - b).map(([ratePct, value]) => ({ ratePct, ...value })),
  }));
}
