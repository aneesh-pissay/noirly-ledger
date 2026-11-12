/**
 * Workflows: when something happens (the trigger), if it fits every
 * condition, do the actions. Conditions read the event's facts; actions
 * notify or email people, label the transaction, or comment on it.
 * Messages can name the facts with {{placeholders}}. What a workflow
 * changes never sets off workflows again.
 */
export const TRIGGERS = ["transaction.added", "expense.submitted", "expense.approved", "expense.rejected", "budget.alert"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_LABEL: Record<Trigger, string> = {
  "transaction.added": "A transaction is added",
  "expense.submitted": "An expense is submitted for approval",
  "expense.approved": "An expense is approved",
  "expense.rejected": "An expense is rejected",
  "budget.alert": "A budget reaches its alert line",
};

export const CONDITION_FIELDS = ["type", "amount", "category", "merchant", "account", "tag", "pool", "member"] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPS = ["is", "is_not", "contains", "gte", "lte"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

/** Which comparisons make sense for a field. */
export const FIELD_OPS: Record<ConditionField, ConditionOp[]> = {
  type: ["is", "is_not"],
  amount: ["gte", "lte"],
  category: ["is", "is_not"],
  merchant: ["contains", "is", "is_not"],
  account: ["is", "is_not"],
  tag: ["is", "is_not"],
  pool: ["is", "is_not"],
  member: ["is", "is_not"],
};

/** The facts a trigger has: a budget alert has only a category; the rest are about one transaction. */
export const TRIGGER_FIELDS: Record<Trigger, ConditionField[]> = {
  "transaction.added": ["type", "amount", "category", "merchant", "account", "tag", "member"],
  "expense.submitted": ["amount", "category", "merchant", "pool", "member"],
  "expense.approved": ["amount", "category", "merchant", "pool", "member"],
  "expense.rejected": ["amount", "category", "merchant", "pool", "member"],
  "budget.alert": ["category"],
};

/** `value` is an id, a type, text, or (for amounts) minor units as a string. */
export type Condition = { field: ConditionField; op: ConditionOp; value: string };

export const ACTION_TYPES = ["notify", "email", "add_tags", "set_category", "set_project", "comment"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Who hears about it: everyone who decides expenses, the owners, whoever the event is about, or named members. */
export const AUDIENCES = ["approvers", "owners", "member", "people"] as const;
export type Audience = (typeof AUDIENCES)[number];

export type Action =
  | { type: "notify" | "email"; audience: Audience; userIds: string[]; message: string }
  | { type: "add_tags"; tags: string[] }
  | { type: "set_category"; categoryId: string }
  | { type: "set_project"; projectId: string }
  | { type: "comment"; message: string };

/** Actions that change a transaction: only for triggers about one. */
export const TRANSACTION_ACTIONS: ActionType[] = ["add_tags", "set_category", "set_project", "comment"];

export type EventFacts = {
  type: string | null;
  amountMinor: number | null;
  categoryId: string | null;
  /** The category's parent, so a condition on a category covers its subcategories. */
  categoryParentId: string | null;
  merchant: string | null;
  accountId: string | null;
  tags: string[];
  poolId: string | null;
  /** Who added or submitted it. */
  memberId: string | null;
};

function norm(text: string | null | undefined) {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function conditionMatches(c: Condition, f: EventFacts): boolean {
  const negate = c.op === "is_not";
  const yes = (hit: boolean) => (negate ? !hit : hit);
  switch (c.field) {
    case "type":
      return yes(f.type === c.value);
    case "amount": {
      const limit = Number(c.value);
      if (f.amountMinor === null || !Number.isFinite(limit)) return false;
      return c.op === "gte" ? f.amountMinor >= limit : f.amountMinor <= limit;
    }
    case "category":
      return yes(f.categoryId === c.value || f.categoryParentId === c.value);
    case "merchant":
      if (c.op === "contains") return Boolean(norm(c.value)) && norm(f.merchant).includes(norm(c.value));
      return yes(norm(f.merchant) === norm(c.value));
    case "account":
      return yes(f.accountId === c.value);
    case "tag":
      return yes(f.tags.includes(norm(c.value).replace(/^#+/, "")));
    case "pool":
      return yes(f.poolId === c.value);
    case "member":
      return yes(f.memberId === c.value);
  }
}

export function allMatch(conditions: readonly Condition[], f: EventFacts) {
  return conditions.every((c) => conditionMatches(c, f));
}

/** Fills {{placeholders}} from `vars`; unknown ones are left as written. */
export function renderTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => (key in vars ? vars[key]! : whole));
}

export const PLACEHOLDERS = ["amount", "merchant", "category", "note", "date", "member", "pool", "percent", "workflow"] as const;

export type WorkflowBody = { name: string; enabled: boolean; trigger: Trigger; conditions: Condition[]; actions: Action[] };

/** A workflow as listed, with its latest runs. */
export type WorkflowView = WorkflowBody & {
  id: string;
  runCount: number;
  lastRunAt: string | null;
  runs: Array<{ id: string; at: string; ok: boolean; summary: string | null; results: string[] }>;
};

/** What's wrong with a workflow, or null. */
export function workflowProblem(w: { name: string; trigger: Trigger; conditions: readonly Condition[]; actions: readonly Action[] }): string | null {
  if (!w.name.trim()) return "Name the workflow";
  if (!w.actions.length) return "Add at least one action";
  const fields = TRIGGER_FIELDS[w.trigger];
  for (const c of w.conditions) {
    if (!fields.includes(c.field)) return `"${c.field}" isn't something that trigger knows`;
    if (!FIELD_OPS[c.field].includes(c.op)) return `"${c.op}" doesn't work with ${c.field}`;
    if (!c.value.trim()) return "Give every condition a value";
    if (c.field === "amount" && !/^\d+$/.test(c.value)) return "Amounts are whole minor units";
  }
  for (const a of w.actions) {
    if (w.trigger === "budget.alert" && TRANSACTION_ACTIONS.includes(a.type)) return "A budget alert has no transaction to change";
    if ((a.type === "notify" || a.type === "email") && a.audience === "people" && !a.userIds.length) return "Pick who to tell";
    if ((a.type === "notify" || a.type === "email" || a.type === "comment") && !a.message.trim()) return "Write the message";
    if (a.type === "add_tags" && !a.tags.length) return "Pick tags to add";
  }
  return null;
}
