export type TxFilters = {
  categoryId?: string;
  accountId?: string;
  tag?: string;
  merchant?: string;
  projectId?: string;
  budgetPoolId?: string;
  from?: string;
  to?: string;
  recurring?: boolean;
};

export const qk = {
  workspaces: ["workspaces"] as const,
  workspace: (id: string) => ["workspaces", id] as const,
  members: (workspaceId: string) => ["members", workspaceId] as const,
  categories: (workspaceId: string) => ["categories", workspaceId] as const,
  transactions: (workspaceId: string, filters: TxFilters = {}) =>
    ["transactions", workspaceId, filters] as const,
  transaction: (id: string) => ["transaction", id] as const,
  budgets: (workspaceId: string) => ["budgets", workspaceId] as const,
  envelopes: (workspaceId: string) => ["envelopes", workspaceId] as const,
  // Under "budgets" so any budget change refreshes the history.
  budgetRevisions: (workspaceId: string) => ["budgets", workspaceId, "revisions"] as const,
  forecast: (workspaceId: string, basis: string) => ["forecast", workspaceId, basis] as const,
  scenarios: (workspaceId: string) => ["scenarios", workspaceId] as const,
  budgetTemplates: (workspaceId: string) => ["budget-templates", workspaceId] as const,
  // Under "budgets" so saving a budget refreshes the plan.
  monthPlan: (workspaceId: string, month: string) => ["budgets", workspaceId, "plan", month] as const,
  budgetPools: (workspaceId: string) => ["budget-pools", workspaceId] as const,
  budgetPool: (poolId: string) => ["budget-pool", poolId] as const,
  approvals: (workspaceId: string, status = "all") =>
    ["approvals", workspaceId, status] as const,
  savingsGoals: (workspaceId: string) => ["savings-goals", workspaceId] as const,
  accounts: (workspaceId: string) => ["accounts", workspaceId] as const,
  // Under "accounts" so anything that refreshes balances refreshes net worth too.
  netWorth: (workspaceId: string) => ["accounts", workspaceId, "net-worth"] as const,
  projection: (workspaceId: string, days: number) => ["accounts", workspaceId, "projection", days] as const,
  // Projects, tags and merchants all follow transactions, so they share a prefix to refresh together.
  projects: (workspaceId: string) => ["labels", workspaceId, "projects"] as const,
  tags: (workspaceId: string) => ["labels", workspaceId, "tags"] as const,
  merchants: (workspaceId: string) => ["labels", workspaceId, "merchants"] as const,
  fxRates: (workspaceId: string) => ["fx-rates", workspaceId] as const,
  dashboard: (workspaceId: string, range: string) =>
    ["dashboard", workspaceId, range] as const,
  notifications: ["notifications"] as const,
};
