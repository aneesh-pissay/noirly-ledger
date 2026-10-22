export type TxFilters = {
  categoryId?: string;
  accountId?: string;
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
  budgetPools: (workspaceId: string) => ["budget-pools", workspaceId] as const,
  budgetPool: (poolId: string) => ["budget-pool", poolId] as const,
  approvals: (workspaceId: string, status = "all") =>
    ["approvals", workspaceId, status] as const,
  savingsGoals: (workspaceId: string) => ["savings-goals", workspaceId] as const,
  accounts: (workspaceId: string) => ["accounts", workspaceId] as const,
  fxRates: (workspaceId: string) => ["fx-rates", workspaceId] as const,
  dashboard: (workspaceId: string, range: string) =>
    ["dashboard", workspaceId, range] as const,
  notifications: ["notifications"] as const,
};
