import type {
  Account,
  NetWorth,
  MonthPlan,
  BudgetTemplateSummary,
  BudgetImpact,
  BudgetRevisionRecord,
  ForecastBaselineResult,
  SavedScenario,
  SavedView,
  InstallmentPlanSummary,
  TransactionActivity,
  ImportPreview,
  ImportBatchSummary,
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
  InboxReceipt,
  TransactionType,
  Workspace,
  WorkspaceWithRole,
} from "@/src/core/sync/types";
import type { NumberFormat } from "@/src/core/locale-format";
import type { ScenarioChange } from "@/src/core/forecast";
import type { WorkspacePurpose } from "@/src/core/workspace-purpose";
import type { BulkChange } from "@/src/core/bulk";
import type { ColumnMapping } from "@/src/core/imports";
import type { DuplicateReason } from "@/src/core/duplicates";
import type { BillItem, BillMarker } from "@/src/core/bills";
import type { ReminderSettings } from "@/src/core/reminders";
import type { PaymentRepeat, PaymentView } from "@/src/core/payments";
import type { SpottedSubscription } from "@/src/core/subscriptions";
import type { SubscriptionInsight } from "@/src/core/subscription-insights";
import type { FundRepeat, FundSuggestion, SinkingFundView } from "@/src/core/sinking-funds";
import type { GoalForecast } from "@/src/core/goal-forecast";
import type { gstSummary } from "@/src/core/gst";

type GstSummary = ReturnType<typeof gstSummary>;

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
  updateCategory(categoryId: string, body: { name?: string; color?: string; parentId?: string | null; defaultGst?: Category["defaultGst"] }) {
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
      q?: string;
      min?: string;
      max?: string;
      clearing?: string;
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
    if (query.q) params.set("q", query.q);
    if (query.min) params.set("min", query.min);
    if (query.max) params.set("max", query.max);
    if (query.clearing) params.set("clearing", query.clearing);
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
  checkDuplicates(
    workspaceId: string,
    body: { type: TransactionType; amountMajor: string; currency: string; date: string; accountId: string | null; text: string; upiRef: string | null; exceptId?: string | null },
  ) {
    return request<{ matches: Array<{ transaction: Transaction; reason: DuplicateReason }> }>(`/api/workspaces/${workspaceId}/duplicates/check`, { method: "POST", body: JSON.stringify(body) });
  },
  listDuplicates(workspaceId: string) {
    return request<{ pairs: Array<{ first: Transaction; second: Transaction; reason: DuplicateReason }> }>(`/api/workspaces/${workspaceId}/duplicates`);
  },
  markNotDuplicate(transactionId: string, otherId: string) {
    return request<{ ok: boolean }>(`/api/transactions/${transactionId}/not-duplicate`, { method: "POST", body: JSON.stringify({ otherId }) });
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
  bulkChangeTransactions(workspaceId: string, body: { ids: string[]; action: { kind: "delete" } | { kind: "update"; change: BulkChange } }) {
    return request<{ done: number; failed: Array<{ id: string; error: string }> }>(`/api/workspaces/${workspaceId}/transactions/bulk`, { method: "POST", body: JSON.stringify(body) });
  },
  bulkCreateTransactions(workspaceId: string, transactions: Array<Record<string, unknown>>) {
    return request<{ transactions: Transaction[] }>(`/api/workspaces/${workspaceId}/transactions/bulk-create`, { method: "POST", body: JSON.stringify({ transactions }) });
  },
  previewImport(workspaceId: string, file: File, options: { mapping?: ColumnMapping | null; bank?: string; accountId?: string | null }) {
    const form = new FormData();
    form.append("file", file);
    if (options.mapping) form.append("mapping", JSON.stringify(options.mapping));
    if (options.bank) form.append("bank", options.bank);
    if (options.accountId) form.append("accountId", options.accountId);
    return request<{ preview: ImportPreview }>(`/api/workspaces/${workspaceId}/imports/preview`, { method: "POST", body: form });
  },
  commitImport(workspaceId: string, file: File, options: { mapping: ColumnMapping; accountId: string | null; categoryId: string | null; skipLines: number[] }) {
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(options.mapping));
    if (options.accountId) form.append("accountId", options.accountId);
    if (options.categoryId) form.append("categoryId", options.categoryId);
    form.append("skipLines", JSON.stringify(options.skipLines));
    return request<{ batch: ImportBatchSummary }>(`/api/workspaces/${workspaceId}/imports`, { method: "POST", body: form });
  },
  listImports(workspaceId: string) {
    return request<{ batches: ImportBatchSummary[] }>(`/api/workspaces/${workspaceId}/imports`);
  },
  undoImport(batchId: string) {
    return request<{ batch: ImportBatchSummary }>(`/api/imports/${batchId}`, { method: "DELETE" });
  },
  getGstSummary(workspaceId: string, from: string, to: string) {
    return request<{ summary: GstSummary }>(`/api/workspaces/${workspaceId}/gst-summary?from=${from}&to=${to}`);
  },
  getTransactionActivity(transactionId: string) {
    return request<{ activity: TransactionActivity }>(`/api/transactions/${transactionId}/activity`);
  },
  addAttachment(transactionId: string, body: { storageKey: string; name: string; contentType: string; size: number }) {
    return request<{ ok: boolean }>(`/api/transactions/${transactionId}/attachments`, { method: "POST", body: JSON.stringify(body) });
  },
  removeAttachment(transactionId: string, attachmentId: string) {
    return request<{ ok: boolean }>(`/api/transactions/${transactionId}/attachments/${attachmentId}`, { method: "DELETE" });
  },
  addComment(transactionId: string, body: string) {
    return request<{ ok: boolean }>(`/api/transactions/${transactionId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  },
  deleteComment(commentId: string) {
    return request<{ ok: boolean }>(`/api/comments/${commentId}`, { method: "DELETE" });
  },
  listInstallmentPlans(workspaceId: string) {
    return request<{ plans: InstallmentPlanSummary[] }>(`/api/workspaces/${workspaceId}/installments`);
  },
  createInstallmentPlan(workspaceId: string, body: Record<string, unknown>) {
    return request<{ plan: InstallmentPlanSummary }>(`/api/workspaces/${workspaceId}/installments`, { method: "POST", body: JSON.stringify(body) });
  },
  closeInstallmentPlan(planId: string, chargeMajor: string | null) {
    return request<{ plan: InstallmentPlanSummary }>(`/api/installments/${planId}/close`, { method: "POST", body: JSON.stringify({ chargeMajor }) });
  },
  deleteInstallmentPlan(planId: string) {
    return request<{ ok: boolean }>(`/api/installments/${planId}`, { method: "DELETE" });
  },
  listViews(workspaceId: string) {
    return request<{ views: SavedView[] }>(`/api/workspaces/${workspaceId}/views`);
  },
  saveView(workspaceId: string, body: { name: string; filters: Record<string, string> }) {
    return request<{ view: SavedView }>(`/api/workspaces/${workspaceId}/views`, { method: "POST", body: JSON.stringify(body) });
  },
  deleteView(viewId: string) {
    return request<{ ok: boolean }>(`/api/views/${viewId}`, { method: "DELETE" });
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
  contributeGoal(goalId: string, amountMajor: string, date?: string) {
    return request<{ goal: SavingsGoal }>(`/api/savings-goals/${goalId}`, {
      method: "POST",
      body: JSON.stringify({ amountMajor, ...(date ? { date } : {}) }),
    });
  },
  setGoalPledge(goalId: string, monthlyMajor: string) {
    return request<{ monthlyMinor: number }>(`/api/savings-goals/${goalId}/pledge`, { method: "PUT", body: JSON.stringify({ monthlyMajor }) });
  },
  listGoalForecasts(workspaceId: string) {
    return request<{ forecasts: Record<string, GoalForecast> }>(`/api/workspaces/${workspaceId}/savings-goals/forecasts`);
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
  getBillCalendar(workspaceId: string, month: string) {
    return request<{ month: string; today: string; items: BillItem[]; markers: BillMarker[]; totals: Array<{ currency: string; paidMinor: number; toPayMinor: number }> }>(
      `/api/workspaces/${workspaceId}/bills?month=${month}`,
    );
  },
  listSpottedSubscriptions(workspaceId: string) {
    return request<{ subscriptions: SpottedSubscription[] }>(`/api/workspaces/${workspaceId}/subscriptions`);
  },
  trackSubscription(workspaceId: string, key: string) {
    return request<{ ruleId: string }>(`/api/workspaces/${workspaceId}/subscriptions/track`, { method: "POST", body: JSON.stringify({ key }) });
  },
  dismissSubscription(workspaceId: string, key: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/subscriptions/dismiss`, { method: "POST", body: JSON.stringify({ key }) });
  },
  listSinkingFunds(workspaceId: string) {
    return request<{ funds: SinkingFundView[]; suggestions: FundSuggestion[] }>(`/api/workspaces/${workspaceId}/sinking-funds`);
  },
  createSinkingFund(
    workspaceId: string,
    body: { name: string; targetMajor: string; currency: string; dueDate: string; repeat?: FundRepeat; savedMajor?: string; ruleId?: string | null; paymentId?: string | null },
  ) {
    return request<{ fund: SinkingFundView }>(`/api/workspaces/${workspaceId}/sinking-funds`, { method: "POST", body: JSON.stringify(body) });
  },
  updateSinkingFund(fundId: string, body: Partial<{ name: string; targetMajor: string; dueDate: string; repeat: FundRepeat }>) {
    return request<{ fund: SinkingFundView }>(`/api/sinking-funds/${fundId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteSinkingFund(fundId: string) {
    return request<{ ok: boolean }>(`/api/sinking-funds/${fundId}`, { method: "DELETE" });
  },
  moveFundMoney(fundId: string, body: { amountMajor: string; direction: "in" | "out" }) {
    return request<{ fund: SinkingFundView }>(`/api/sinking-funds/${fundId}/move`, { method: "POST", body: JSON.stringify(body) });
  },
  spendFund(fundId: string, spentMajor?: string | null) {
    return request<{ fund: SinkingFundView | null }>(`/api/sinking-funds/${fundId}/spent`, { method: "POST", body: JSON.stringify({ spentMajor: spentMajor ?? null }) });
  },
  listSubscriptionInsights(workspaceId: string) {
    return request<{ insights: SubscriptionInsight[] }>(`/api/workspaces/${workspaceId}/subscription-insights`);
  },
  dismissInsight(workspaceId: string, id: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/subscription-insights/dismiss`, { method: "POST", body: JSON.stringify({ id }) });
  },
  markStillUsed(ruleId: string) {
    return request<{ reviewedOn: string }>(`/api/transactions/${ruleId}/still-used`, { method: "POST" });
  },
  listPayments(workspaceId: string) {
    return request<{ payments: PaymentView[] }>(`/api/workspaces/${workspaceId}/payments`);
  },
  createPayment(
    workspaceId: string,
    body: { name: string; amountMajor: string; currency: string; dueDate: string; accountId?: string | null; categoryId?: string | null; note?: string | null; upiId?: string | null; payeeName?: string | null; repeat?: PaymentRepeat },
  ) {
    return request<{ payment: PaymentView }>(`/api/workspaces/${workspaceId}/payments`, { method: "POST", body: JSON.stringify(body) });
  },
  updatePayment(
    paymentId: string,
    body: Partial<{ name: string; amountMajor: string; currency: string; dueDate: string; accountId: string | null; categoryId: string | null; note: string | null; upiId: string | null; payeeName: string | null; repeat: PaymentRepeat }>,
  ) {
    return request<{ payment: PaymentView }>(`/api/payments/${paymentId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deletePayment(paymentId: string) {
    return request<{ ok: boolean }>(`/api/payments/${paymentId}`, { method: "DELETE" });
  },
  payPayment(
    paymentId: string,
    body:
      | { how: "record"; paidOn: string; amountMajor?: string | null; accountId?: string | null; upiRef?: string | null }
      | { how: "link"; transactionId: string }
      | { how: "mark"; paidOn: string },
  ) {
    return request<{ payment: PaymentView; next: PaymentView | null }>(`/api/payments/${paymentId}/pay`, { method: "POST", body: JSON.stringify(body) });
  },
  undoPayment(paymentId: string) {
    return request<{ payment: PaymentView }>(`/api/payments/${paymentId}/undo`, { method: "POST" });
  },
  paymentMatches(paymentId: string) {
    return request<{ matches: Transaction[] }>(`/api/payments/${paymentId}/matches`);
  },
  setReminders(ruleId: string, settings: ReminderSettings | null) {
    return request<{ reminders: ReminderSettings | null }>(`/api/transactions/${ruleId}/reminders`, { method: "PUT", body: JSON.stringify(settings) });
  },
  listReceiptInbox(workspaceId: string) {
    return request<{ receipts: InboxReceipt[] }>(`/api/workspaces/${workspaceId}/receipt-inbox`);
  },
  uploadReceiptsToInbox(workspaceId: string, files: File[]) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    return request<{ uploaded: number }>(`/api/workspaces/${workspaceId}/receipt-inbox`, { method: "POST", body: form });
  },
  updateInboxReceipt(receiptId: string, body: { date?: string | null; amountMajor?: string | null; currency?: string | null; merchant?: string | null }) {
    return request<{ ok: boolean }>(`/api/receipt-inbox/${receiptId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteInboxReceipt(receiptId: string) {
    return request<{ ok: boolean }>(`/api/receipt-inbox/${receiptId}`, { method: "DELETE" });
  },
  matchReceipt(receiptId: string, transactionId: string) {
    return request<{ ok: boolean }>(`/api/receipt-inbox/${receiptId}/match`, { method: "POST", body: JSON.stringify({ transactionId }) });
  },
  matchAllReceipts(workspaceId: string) {
    return request<{ matched: number }>(`/api/workspaces/${workspaceId}/receipt-inbox/match-all`, { method: "POST" });
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
