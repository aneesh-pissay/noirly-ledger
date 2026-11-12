import { cleanMerchant, normalizeTags } from "@/src/core/labels";

/**
 * Rules for incoming transactions: when a new expense or income's note or
 * merchant reads a certain way (and, if set, it's of a type, in an account
 * or within an amount range), fill in its category, a clean merchant name,
 * tags or a project. Rules are tried in order; for each field the first
 * matching rule that sets it wins. A rule only fills what the transaction
 * doesn't have: whatever someone chose themselves stays.
 */
export const TEXT_FIELDS = ["any", "note", "merchant"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const TEXT_OPS = ["contains", "starts_with", "equals"] as const;
export type TextOp = (typeof TEXT_OPS)[number];

export type RuleSpec = {
  id: string;
  name: string;
  field: TextField;
  op: TextOp;
  /** Matched ignoring case and extra spaces. */
  value: string;
  type: "expense" | "income" | null;
  accountId: string | null;
  minMinor: number | null;
  maxMinor: number | null;
  set: { categoryId: string | null; merchant: string | null; tags: string[]; projectId: string | null };
};

/** A rule as listed: in order, with how often it has filled something in. */
export type RuleView = RuleSpec & { order: number; appliedCount: number };

export type IncomingFacts = {
  type: string;
  note: string | null;
  merchant: string | null;
  accountId: string | null;
  amountMinor: number;
};

/** What a transaction already has: rules leave these alone. */
export type AlreadySet = { categoryId: boolean; merchant: boolean; projectId: boolean };

export type RuleResult = {
  categoryId: string | null;
  merchant: string | null;
  projectId: string | null;
  tags: string[];
  /** The rules that set something, in order. */
  ruleIds: string[];
};

export function normalizeText(text: string | null | undefined) {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function textMatches(op: TextOp, haystack: string, needle: string) {
  if (!needle || !haystack) return false;
  if (op === "equals") return haystack === needle;
  if (op === "starts_with") return haystack.startsWith(needle);
  return haystack.includes(needle);
}

export function ruleMatches(rule: RuleSpec, facts: IncomingFacts): boolean {
  if (rule.type && rule.type !== facts.type) return false;
  if (rule.accountId && rule.accountId !== facts.accountId) return false;
  if (rule.minMinor !== null && facts.amountMinor < rule.minMinor) return false;
  if (rule.maxMinor !== null && facts.amountMinor > rule.maxMinor) return false;
  const needle = normalizeText(rule.value);
  const fields = rule.field === "any" ? [facts.note, facts.merchant] : [rule.field === "note" ? facts.note : facts.merchant];
  return fields.some((f) => textMatches(rule.op, normalizeText(f), needle));
}

/** Only expenses and income are filled in; refunds follow their expense, transfers have no category. */
export function rulesApplyTo(type: string) {
  return type === "expense" || type === "income";
}

export function applyRules(rules: readonly RuleSpec[], facts: IncomingFacts, already: AlreadySet): RuleResult {
  const out: RuleResult = { categoryId: null, merchant: null, projectId: null, tags: [], ruleIds: [] };
  if (!rulesApplyTo(facts.type)) return out;
  for (const rule of rules) {
    if (!ruleMatches(rule, facts)) continue;
    let used = false;
    if (rule.set.categoryId && !already.categoryId && !out.categoryId) {
      out.categoryId = rule.set.categoryId;
      used = true;
    }
    if (rule.set.merchant && !already.merchant && !out.merchant) {
      out.merchant = rule.set.merchant;
      used = true;
    }
    if (rule.set.projectId && !already.projectId && !out.projectId) {
      out.projectId = rule.set.projectId;
      used = true;
    }
    const newTags = rule.set.tags.filter((t) => !out.tags.includes(t));
    if (newTags.length) {
      out.tags.push(...newTags);
      used = true;
    }
    if (used) out.ruleIds.push(rule.id);
  }
  return out;
}

/** What's wrong with a rule, or null: it needs text to look for and something to do. */
export function ruleProblem(rule: Pick<RuleSpec, "value" | "minMinor" | "maxMinor" | "set">): string | null {
  if (!normalizeText(rule.value)) return "Give the rule some text to look for";
  if (rule.minMinor !== null && rule.maxMinor !== null && rule.minMinor > rule.maxMinor) return "The lowest amount is above the highest";
  const s = rule.set;
  if (!s.categoryId && !s.merchant && !s.projectId && !s.tags.length) return "Give the rule something to set";
  try {
    if (s.merchant) cleanMerchant(s.merchant);
    normalizeTags(s.tags);
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid merchant or tags";
  }
  return null;
}
