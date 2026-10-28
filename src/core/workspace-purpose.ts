import { DEFAULT_CATEGORIES } from "@/src/core/categories/defaults";

/**
 * What a shared workspace is for, which shapes what it shows. A team shares
 * budget pools and approves each other's expenses. A household keeps its
 * shared money like a personal workspace does (transactions, accounts,
 * budgets) plus shared pots. A business has both: its own books, and expense
 * submission with approvals. The personal workspace is always personal.
 */
export const WORKSPACE_PURPOSES = ["team", "household", "business"] as const;
export type WorkspacePurpose = (typeof WORKSPACE_PURPOSES)[number];

export const PURPOSE_LABEL: Record<WorkspacePurpose, string> = {
  team: "Team",
  household: "Household",
  business: "Business",
};

export const PURPOSE_DESCRIPTION: Record<WorkspacePurpose, string> = {
  team: "Shared budget pools; members submit expenses and approvers decide.",
  household: "Shared money at home: transactions, accounts, budgets and shared pots.",
  business: "The business's books, plus expense claims with approvals.",
};

/** The pages a shared workspace shows, in the order of its menu. */
export type WorkspaceSection = "transactions" | "accounts" | "budgets" | "pools" | "goals" | "expenses" | "approvals";

export const PURPOSE_SECTIONS: Record<WorkspacePurpose, WorkspaceSection[]> = {
  team: ["pools", "expenses", "approvals"],
  household: ["transactions", "accounts", "budgets", "pools", "goals"],
  business: ["transactions", "accounts", "budgets", "expenses", "approvals", "pools"],
};

export function hasSection(purpose: WorkspacePurpose, section: WorkspaceSection) {
  return PURPOSE_SECTIONS[purpose].includes(section);
}

/** What pools are called: a household's are shared pots. */
export function poolsLabel(purpose: WorkspacePurpose) {
  return purpose === "household" ? "Shared pots" : "Budget pools";
}

type CategorySeed = { name: string; icon: string; color: string };

const SYSTEM_ONLY = DEFAULT_CATEGORIES.filter((c) => c.name === "Income" || c.name === "Transfer");

/** The categories a new workspace starts with. Every set keeps Income and Transfer. */
export function startingCategories(purpose: WorkspacePurpose | "personal"): CategorySeed[] {
  if (purpose === "household") {
    return [
      { name: "Groceries", icon: "shopping-basket", color: "#3DDC97" },
      { name: "Rent or EMI", icon: "home", color: "#C9A227" },
      { name: "Utilities", icon: "plug", color: "#52D3FE" },
      { name: "Kids", icon: "baby", color: "#F7A1C4" },
      { name: "Household help", icon: "hand-helping", color: "#B28DFF" },
      { name: "Health", icon: "heart-pulse", color: "#FF6B6B" },
      { name: "Transport", icon: "car", color: "#FFB547" },
      { name: "Outings", icon: "party-popper", color: "#7BD389" },
      ...SYSTEM_ONLY,
    ];
  }
  if (purpose === "business") {
    return [
      { name: "Travel", icon: "plane", color: "#52D3FE" },
      { name: "Meals and entertainment", icon: "utensils", color: "#FFB547" },
      { name: "Software and subscriptions", icon: "laptop", color: "#B28DFF" },
      { name: "Office and supplies", icon: "briefcase", color: "#C9A227" },
      { name: "Salaries and contractors", icon: "users", color: "#3DDC97" },
      { name: "Marketing", icon: "megaphone", color: "#F7A1C4" },
      { name: "Rent and utilities", icon: "building", color: "#7BD389" },
      { name: "Taxes and fees", icon: "receipt", color: "#FF6B6B" },
      ...SYSTEM_ONLY,
    ];
  }
  return DEFAULT_CATEGORIES;
}
