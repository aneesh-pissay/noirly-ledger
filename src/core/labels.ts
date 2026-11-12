/**
 * Tags, merchants and projects: three ways to find and group transactions
 * beyond their category. Tags are free words; a merchant is who was paid (or
 * paid you); a project is something the workspace sets up, like a trip or a
 * renovation.
 */

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;
export const MAX_MERCHANT_LENGTH = 80;

/**
 * Tags as stored: lowercase, without a leading #, spaces as hyphens, no
 * repeats, in the order given. Throws on too many or too long, so the caller
 * can say so rather than quietly dropping some.
 */
export function normalizeTags(input: string[]): string[] {
  const tags: string[] = [];
  for (const raw of input) {
    const tag = raw.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || tags.includes(tag)) continue;
    if (tag.length > MAX_TAG_LENGTH) throw new Error(`Tags can be up to ${MAX_TAG_LENGTH} characters`);
    tags.push(tag);
  }
  if (tags.length > MAX_TAGS) throw new Error(`A transaction can have up to ${MAX_TAGS} tags`);
  return tags;
}

/** Tags typed into one box: "#trip, work food" → ["trip", "work", "food"]. */
export function parseTagInput(text: string): string[] {
  return text.split(/[,\s]+/).filter(Boolean);
}

/** A merchant's name as shown: trimmed, inner spaces collapsed; null when empty. */
export function cleanMerchant(name: string | null | undefined): string | null {
  const cleaned = (name ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (cleaned.length > MAX_MERCHANT_LENGTH) throw new Error(`Merchant names can be up to ${MAX_MERCHANT_LENGTH} characters`);
  return cleaned;
}

/** What groups a merchant's transactions together: "Blue Bottle  Coffee" and "blue bottle coffee" are one. */
export function merchantKey(name: string | null | undefined): string | null {
  const cleaned = cleanMerchant(name);
  return cleaned ? cleaned.toLowerCase() : null;
}
