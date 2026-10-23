import type {
  Account,
  NetWorth,
  MonthPlan,
  BudgetTemplateSummary,
  BudgetImpact,
  BudgetRevisionRecord,
  ForecastBaselineResult,
  SavedScenario,
  EnvelopeState,
  EnvelopeMoveRecord,
  Project,
  TagSummary,
  MerchantSummary,
  Projection,
  ApprovalRequest,
  ApprovalView,
  Budget,
  BudgetPool,
  Category,
  DashboardSummary,
  DateRangePreset,
  FxRate,
  InAppNotification,
  MemberRole,
  MemberView,
  SavingsGoal,
  Transaction,
  TransactionType,
  Workspace,
  WorkspaceWithRole,
} from "@/src/core/sync/types";
import type { NumberFormat } from "@/src/core/locale-format";
import type { ScenarioChange } from "@/src/core/forecast";
import type { WorkspacePurpose } from "@/src/core/workspace-purpose";

type ApiErrorBody = { error?: string; message?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Proves the request came from this app's own scripts (see proxy.ts).
  headers.set("X-Noirly-CSRF", "1");
  const response = await fetch(path, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.message || data.error || "Request failed");
  }
  return data;
}

export const api = {
  me() {
    return request<{
      user: {
        id: string;
        email: string;
        displayName: string;
        identitySub: string;
        baseCurrency: string;
      };
    }>("/api/me");
  },
  listWorkspaces() {
    return request<{ workspaces: WorkspaceWithRole[] }>("/api/workspaces");
  },
  updateMe(body: { numberFormat: NumberFormat }) {
    return request<{ numberFormat: NumberFormat }>("/api/me", { method: "PATCH", body: JSON.stringify(body) });
  },
  updateWorkspaceSettings(workspaceId: string, body: { fiscalYearStartMonth?: number; purpose?: WorkspacePurpose }) {
    return request<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}/settings`, { method: "PATCH", body: JSON.stringify(body) });
  },
  createWorkspace(input: { name: string; baseCurrency?: string; purpose?: WorkspacePurpose }) {
    return request<{ workspace: Workspace }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listCategories(workspaceId: string) {
    return request<{ categories: Category[] }>(
      `/api/workspaces/${workspaceId}/categories`,
    );
  },
  createCategory(
    workspaceId: string,
    body: { name: string; icon?: string; color?: string; parentId?: string | null },
  ) {
    return request<{ category: Category }>(
      `/api/workspaces/${workspaceId}/categories`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  updateCategory(categoryId: string, body: { name?: string; color?: string; parentId?: string | null }) {
    return request<{ category: Category }>(`/api/categories/${categoryId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteCategory(categoryId: string) {
    return request<{ ok: boolean }>(`/api/categories/${categoryId}`, {
      method: "DELETE",
    });
  },
  listTransactions(
    workspaceId: string,
    query: {
      cursor?: string;
      categoryId?: string;
      accountId?: string;
      tag?: string;
      merchant?: string;
      projectId?: string;
      from?: string;
      to?: string;
      type?: TransactionType;
      recurring?: boolean;
      limit?: number;
    } = {},
  ) {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.categoryId) params.set("categoryId", query.categoryId);
    if (query.accountId) params.set("accountId", query.accountId);
    if (query.tag) params.set("tag", query.tag);
    if (query.merchant) params.set("merchant", query.merchant);
    if (query.projectId) params.set("projectId", query.projectId);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.type) params.set("type", query.type);
    if (query.recurring) params.set("recurring", "1");
    if (query.limit) params.set("limit", String(query.limit));
    const qs = params.toString();
    return request<{ items: Transaction[]; nextCursor?: string }>(
      `/api/workspaces/${workspaceId}/transactions${qs ? `?${qs}` : ""}`,
    );
  },
  createTransaction(
    workspaceId: string,
    body: Record<string, unknown>,
  ) {
    return request<{ transaction: Transaction }>(
      `/api/workspaces/${workspaceId}/transactions`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  updateTransaction(transactionId: string, body: Record<string, unknown>) {
    return request<{ transaction: Transaction }>(`/api/transactions/${transactionId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteTransaction(transactionId: string) {
    return request<{ ok: boolean }>(`/api/transactions/${transactionId}`, {
      method: "DELETE",
    });
  },
  listBudgets(workspaceId: string) {
    return request<{ budgets: Budget[] }>(
      `/api/workspaces/${workspaceId}/budgets`,
    );
  },
  upsertBudget(workspaceId: string, body: Record<string, unknown>) {
    return request<{ budget: Budget }>(`/api/workspaces/${workspaceId}/budgets`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  checkBudgets(workspaceId: string, body: { lines: Array<{ categoryId: string; amountMajor: string }>; currency: string; date: string }) {
    return request<{ impacts: BudgetImpact[]; missingRate: boolean }>(`/api/workspaces/${workspaceId}/budget-check`, { method: "POST", body: JSON.stringify(body) });
  },
  moveBudgetMoney(workspaceId: string, body: { fromBudgetId: string; toBudgetId: string; amountMajor: string; note?: string | null }) {
    return request<{ fromLimitMinor: number; toLimitMinor: number | null }>(`/api/workspaces/${workspaceId}/budgets/move`, { method: "POST", body: JSON.stringify(body) });
  },
  listBudgetRevisions(workspaceId: string, budgetId?: string) {
    return request<{ revisions: BudgetRevisionRecord[] }>(`/api/workspaces/${workspaceId}/budget-revisions${budgetId ? `?budgetId=${budgetId}` : ""}`);
  },
  restoreBudgetRevision(revisionId: string) {
    return request<{ limitMinor: number }>(`/api/budget-revisions/${revisionId}/restore`, { method: "POST", body: "{}" });
  },
  getForecastBaseline(workspaceId: string, basis: "recent" | "budgets") {
    return request<{ forecast: ForecastBaselineResult }>(`/api/workspaces/${workspaceId}/forecast?basis=${basis}`);
  },
  listScenarios(workspaceId: string) {
    return request<{ scenarios: SavedScenario[] }>(`/api/workspaces/${workspaceId}/scenarios`);
  },
  createScenario(workspaceId: string, body: { name: string; changes: ScenarioChange[] }) {
    return request<{ scenario: SavedScenario }>(`/api/workspaces/${workspaceId}/scenarios`, { method: "POST", body: JSON.stringify(body) });
  },
  updateScenario(scenarioId: string, body: { name: string; changes: ScenarioChange[] }) {
    return request<{ scenario: SavedScenario }>(`/api/scenarios/${scenarioId}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteScenario(scenarioId: string) {
    return request<{ ok: boolean }>(`/api/scenarios/${scenarioId}`, { method: "DELETE" });
  },
  listBudgetTemplates(workspaceId: string) {
    return request<{ templates: BudgetTemplateSummary[] }>(`/api/workspaces/${workspaceId}/budget-templates`);
  },
  saveBudgetTemplate(workspaceId: string, name: string) {
    return request<{ template: BudgetTemplateSummary }>(`/api/workspaces/${workspaceId}/budget-templates`, { method: "POST", body: JSON.stringify({ name }) });
  },
  applyBudgetTemplate(workspaceId: string, templateId: string, monthlyIncomeMajor: string | null) {
    return request<{ budgets: number; categoriesCreated: number }>(`/api/workspaces/${workspaceId}/budget-templates/apply`, { method: "POST", body: JSON.stringify({ templateId, monthlyIncomeMajor }) });
  },
  deleteBudgetTemplate(templateId: string) {
    return request<{ ok: boolean }>(`/api/budget-templates/${templateId}`, { method: "DELETE" });
  },
  deleteBudget(budgetId: string) {
    return request<{ ok: boolean }>(`/api/budgets/${budgetId}`, {
      method: "DELETE",
    });
  },
  listAccounts(workspaceId: string) {
    return request<{ accounts: Account[] }>(`/api/workspaces/${workspaceId}/accounts`);
  },
  createAccount(workspaceId: string, body: { name: string; kind: Account["kind"]; currency: string; openingMajor: string; openingDate: string; institution?: string | null }) {
    return request<{ account: Account }>(`/api/workspaces/${workspaceId}/accounts`, { method: "POST", body: JSON.stringify(body) });
  },
  updateAccount(accountId: string, body: { name?: string; archived?: boolean; openingMajor?: string; institution?: string | null }) {
    return request<{ account: Account }>(`/api/accounts/${accountId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  listProjects(workspaceId: string) {
    return request<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`);
  },
  createProject(workspaceId: string, body: { name: string; color?: string }) {
    return request<{ project: Project }>(`/api/workspaces/${workspaceId}/projects`, { method: "POST", body: JSON.stringify(body) });
  },
  updateProject(projectId: string, body: { name?: string; color?: string; archived?: boolean }) {
    return request<{ project: Project }>(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteProject(projectId: string) {
    return request<{ ok: boolean }>(`/api/projects/${projectId}`, { method: "DELETE" });
  },
  listTags(workspaceId: string) {
    return request<{ tags: TagSummary[] }>(`/api/workspaces/${workspaceId}/tags`);
  },
  listMerchants(workspaceId: string) {
    return request<{ merchants: MerchantSummary[] }>(`/api/workspaces/${workspaceId}/merchants`);
  },
  getEnvelopes(workspaceId: string) {
    return request<{ envelopes: EnvelopeState; moves: EnvelopeMoveRecord[] }>(`/api/workspaces/${workspaceId}/envelopes`);
  },
  startEnvelopes(workspaceId: string, since: string) {
    return request<{ envelopes: EnvelopeState }>(`/api/workspaces/${workspaceId}/envelopes`, { method: "PUT", body: JSON.stringify({ since }) });
  },
  moveEnvelopeMoney(workspaceId: string, body: { fromCategoryId: string | null; toCategoryId: string | null; amountMajor: string; note?: string | null }) {
    return request<{ envelopes: EnvelopeState }>(`/api/workspaces/${workspaceId}/envelopes/moves`, { method: "POST", body: JSON.stringify(body) });
  },
  getMonthPlan(workspaceId: string, month: string) {
    return request<{ plan: MonthPlan }>(`/api/workspaces/${workspaceId}/plan?month=${month}`);
  },
  setExpectedIncome(workspaceId: string, month: string, expectedIncomeMajor: string | null) {
    return request<{ plan: MonthPlan }>(`/api/workspaces/${workspaceId}/plan`, { method: "PUT", body: JSON.stringify({ month, expectedIncomeMajor }) });
  },
  getNetWorth(workspaceId: string, months = 12) {
    return request<{ netWorth: NetWorth }>(`/api/workspaces/${workspaceId}/net-worth?months=${months}`);
  },
  getProjection(workspaceId: string, days = 30) {
    return request<{ projection: Projection }>(`/api/workspaces/${workspaceId}/projection?days=${days}`);
  },
  reconcileAccount(accountId: string, body: { statementMajor: string; through: string }) {
    return request<{ account: Account; reconciled: number }>(`/api/accounts/${accountId}/reconcile`, { method: "POST", body: JSON.stringify(body) });
  },
  deleteAccount(accountId: string) {
    return request<{ ok: boolean }>(`/api/accounts/${accountId}`, { method: "DELETE" });
  },
  listGoals(workspaceId: string) {
    return request<{ goals: SavingsGoal[] }>(
      `/api/workspaces/${workspaceId}/savings-goals`,
    );
  },
  createGoal(workspaceId: string, body: Record<string, unknown>) {
    return request<{ goal: SavingsGoal }>(
      `/api/workspaces/${workspaceId}/savings-goals`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  contributeGoal(goalId: string, amountMajor: string) {
    return request<{ goal: SavingsGoal }>(`/api/savings-goals/${goalId}`, {
      method: "POST",
      body: JSON.stringify({ amountMajor }),
    });
  },
  deleteGoal(goalId: string) {
    return request<{ ok: boolean }>(`/api/savings-goals/${goalId}`, {
      method: "DELETE",
    });
  },
  listFxRates(workspaceId: string) {
    return request<{ rates: FxRate[] }>(
      `/api/workspaces/${workspaceId}/fx-rates`,
    );
  },
  upsertFxRate(workspaceId: string, body: Record<string, unknown>) {
    return request<{ rate: FxRate }>(`/api/workspaces/${workspaceId}/fx-rates`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  dashboard(workspaceId: string, range: DateRangePreset) {
    return request<{ summary: DashboardSummary }>(
      `/api/workspaces/${workspaceId}/dashboard?range=${range}`,
    );
  },
  uploadReceipt(workspaceId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{ key: string; url: string }>(
      `/api/workspaces/${workspaceId}/receipts`,
      { method: "POST", body: form },
    );
  },
  listPools(workspaceId: string) {
    return request<{ pools: BudgetPool[] }>(
      `/api/workspaces/${workspaceId}/budget-pools`,
    );
  },
  getPool(poolId: string) {
    return request<{ pool: BudgetPool }>(`/api/budget-pools/${poolId}`);
  },
  createPool(workspaceId: string, body: Record<string, unknown>) {
    return request<{ pool: BudgetPool }>(
      `/api/workspaces/${workspaceId}/budget-pools`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  listExpenses(workspaceId: string, poolId?: string) {
    const qs = poolId ? `?poolId=${encodeURIComponent(poolId)}` : "";
    return request<{ items: Transaction[]; nextCursor?: string }>(
      `/api/workspaces/${workspaceId}/expenses${qs}`,
    );
  },
  submitExpense(workspaceId: string, body: Record<string, unknown>) {
    return request<{ transaction: Transaction; approval: ApprovalRequest }>(
      `/api/workspaces/${workspaceId}/expenses`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  listApprovals(workspaceId: string, status?: string) {
    const qs = status ? `?status=${status}` : "";
    return request<{ approvals: ApprovalView[] }>(
      `/api/workspaces/${workspaceId}/approvals${qs}`,
    );
  },
  decideApproval(
    approvalId: string,
    body: { decision: "approved" | "rejected"; reviewNote?: string | null },
  ) {
    return request<{
      approval: ApprovalView;
      transaction: Transaction;
      pool: BudgetPool;
    }>(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  listMembers(workspaceId: string) {
    return request<{ members: MemberView[] }>(
      `/api/workspaces/${workspaceId}/members`,
    );
  },
  updateMember(workspaceId: string, userId: string, role: MemberRole) {
    return request<{ member: { userId: string; role: MemberRole } }>(
      `/api/workspaces/${workspaceId}/members`,
      { method: "PATCH", body: JSON.stringify({ userId, role }) },
    );
  },
  removeMember(workspaceId: string, userId: string) {
    return request<{ ok: boolean }>(
      `/api/workspaces/${workspaceId}/members/${userId}`,
      { method: "DELETE" },
    );
  },
  createInvite(workspaceId: string, role: Exclude<MemberRole, "owner">) {
    return request<{
      invite: { token: string; url: string; role: string; expiresAt: string };
    }>(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },
  listNotifications() {
    return request<{ notifications: InAppNotification[] }>("/api/notifications");
  },
  markNotificationRead(id: string) {
    return request<{ ok: boolean }>(`/api/notifications/${id}/read`, {
      method: "POST",
    });
  },
  async exportReport(
    workspaceId: string,
    body: {
      format: "csv" | "pdf";
      from: string;
      to: string;
      template: "summary" | "pool" | "approvals";
      budgetPoolId?: string | null;
    },
  ) {
    const response = await fetch(`/api/workspaces/${workspaceId}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Noirly-CSRF": "1" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as ApiErrorBody;
      throw new Error(data.message || data.error || "Export failed");
    }
    return response.blob();
  },
};
