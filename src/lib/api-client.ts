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
  ApprovalRuleView,
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
  CustomRoleView,
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
import type { LoanView } from "@/src/core/loans";
import type { DebtStrategy, DebtView } from "@/src/core/debts";
import type { CardTerms, CardView } from "@/src/core/credit-cards";
import type { PermissionAction } from "@/src/core/permissions/can";
import type { gstSummary } from "@/src/core/gst";
import type { ApprovalStepSpec } from "@/src/core/approval-rules";
import type { ApprovalEventView, DelegationView } from "@/src/core/delegations";
import type { PayoutMethod, PayoutView, ReimbursementView } from "@/src/core/reimbursements";
import type { PolicyEnforcement, PolicyViolation, SpendingPolicyView } from "@/src/core/spending-policies";
import type { DepartmentView, GroupPeriod } from "@/src/core/group-budgets";
import type { DeadlineSettings } from "@/src/core/deadlines";
import type { MemberLimitPeriod } from "@/src/core/pool-rules";
import type { AllocationMode, PoolFunding } from "@/src/core/pool-contributions";
import type { Granularity } from "@/src/core/reports/periods";
import type { CashFlowReport, IncomeExpenseReport } from "@/src/core/reports/cash-flow-report";
import type { SpendingAnalysis } from "@/src/core/reports/spending";
import type { BudgetComparison, budgetSummary } from "@/src/core/reports/budget-vs-actual";
import type { Trends } from "@/src/core/reports/trends";
import type { DebtProgress, NetWorthReport } from "@/src/core/reports/net-worth-report";
import type { Widget } from "@/src/core/dashboard-widgets";
import type { CategoryVariance, SavingsAnalysis, Unusual } from "@/src/core/reports/insights";
import type { RuleView, TextField, TextOp } from "@/src/core/auto-rules";
import type { WorkflowBody, WorkflowView } from "@/src/core/workflows";
import type { AutomationBody, AutomationView } from "@/src/core/automations";
import type { NotificationPrefs } from "@/src/core/notification-prefs";
import type { FlowLinkSettings, FlowLinkView } from "@/src/core/flow-sync";
import type { FeedSettings, FeedStatus } from "@/src/core/calendar-feed";
import type { InboundView } from "@/src/core/inbound-email";
import type { AccessTokenView, TokenScope } from "@/src/core/access-tokens";
import type { AuditEntryView, ChainCheck } from "@/src/core/audit";
import type { BackupFrequency, BackupSettings, BackupView, RestoreResult } from "@/src/core/backup";
import type { ReconReport } from "@/src/core/reconciliation";
import type { RetentionPolicy } from "@/src/core/retention";
import type { PendingActionView } from "@/src/core/dual-control";

type PendingActionsState = { enabled: boolean; available: boolean; owners: number; isOwner: boolean; actions: PendingActionView[] };
import type { DeliveryView, WebhookEventType, WebhookView } from "@/src/core/webhooks";

/** A rule for incoming transactions as sent: amounts in major units, null for open. */
export type TransactionRuleBody = {
  name: string;
  field: TextField;
  op: TextOp;
  value: string;
  type: "expense" | "income" | null;
  accountId: string | null;
  minMajor: string | null;
  maxMajor: string | null;
  set: { categoryId: string | null; merchant: string | null; tags: string[]; projectId: string | null };
};
import type { ExportFormat, ScheduledExportBody, ScheduledExportView } from "@/src/core/export-schedules";

/** A report's range and periods. */
export type ReportRange = { from: string; to: string; granularity: Granularity };

/** A department or team as sent: its budget per period in major units of the base currency, null for none. */
export type DepartmentBody = {
  name: string;
  parentId: string | null;
  budgetMajor: string | null;
  period: GroupPeriod;
  alertPct: number;
  memberIds: string[];
};

/** A spending policy as sent: amounts in major units of the base currency, null for none. */
export type SpendingPolicyBody = {
  name: string;
  categoryIds: string[];
  merchants: string[];
  budgetPoolIds: string[];
  maxMajor: string | null;
  receiptOverMajor: string | null;
  disallowed: boolean;
  enforcement: PolicyEnforcement;
};

type GstSummary = ReturnType<typeof gstSummary>;

/** An approval rule as sent: amounts in major units of the base currency, null for open. */
export type ApprovalRuleBody = {
  name: string;
  minMajor: string | null;
  maxMajor: string | null;
  categoryIds: string[];
  budgetPoolIds: string[];
  steps: ApprovalStepSpec[];
};

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
  updateWorkspaceSettings(workspaceId: string, body: { fiscalYearStartMonth?: number; purpose?: WorkspacePurpose; approvalDeadlines?: DeadlineSettings; autoFxRates?: boolean }) {
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
  createAccount(workspaceId: string, body: { name: string; kind: Account["kind"]; currency: string; openingMajor: string; openingDate: string; institution?: string | null; number?: string | null }) {
    return request<{ account: Account }>(`/api/workspaces/${workspaceId}/accounts`, { method: "POST", body: JSON.stringify(body) });
  },
  revealAccountNumber(accountId: string) {
    return request<{ number: string }>(`/api/accounts/${accountId}/number`, { method: "POST" });
  },
  updateAccount(accountId: string, body: { name?: string; archived?: boolean; openingMajor?: string; institution?: string | null; number?: string | null }) {
    return request<{ account: Account }>(`/api/accounts/${accountId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  listProjects(workspaceId: string) {
    return request<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`);
  },
  createProject(workspaceId: string, body: { name: string; color?: string }) {
    return request<{ project: Project }>(`/api/workspaces/${workspaceId}/projects`, { method: "POST", body: JSON.stringify(body) });
  },
  updateProject(projectId: string, body: { name?: string; color?: string; archived?: boolean; budgetMajor?: string | null; alertPct?: number }) {
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
  listCards(workspaceId: string) {
    return request<{ cards: CardView[] }>(`/api/workspaces/${workspaceId}/cards`);
  },
  setCardTerms(accountId: string, body: { statementDay: number; dueDays: number; creditLimitMajor?: string | null; minimumPct?: number } | null) {
    return request<{ terms: CardTerms | null }>(`/api/accounts/${accountId}/card-terms`, { method: "PUT", body: JSON.stringify(body) });
  },
  listDebts(workspaceId: string) {
    return request<{ baseCurrency: string; debts: DebtView[]; strategy: DebtStrategy; extraMonthlyMinor: number; missingRates: string[] }>(`/api/workspaces/${workspaceId}/debts`);
  },
  saveDebtSettings(
    workspaceId: string,
    body: { strategy?: DebtStrategy; extraMonthlyMajor?: string; debt?: { accountId: string; annualRatePct?: number | null; minimumMajor?: string | null } },
  ) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/debts`, { method: "PUT", body: JSON.stringify(body) });
  },
  listLoans(workspaceId: string) {
    return request<{ loans: LoanView[] }>(`/api/workspaces/${workspaceId}/loans`);
  },
  createLoan(
    workspaceId: string,
    body: { name: string; loanAccountId: string; payFromAccountId: string; categoryId?: string | null; principalMajor: string; annualRatePct: number; months: number; firstDate: string },
  ) {
    return request<{ loan: LoanView }>(`/api/workspaces/${workspaceId}/loans`, { method: "POST", body: JSON.stringify(body) });
  },
  recordEmi(loanId: string, date?: string | null) {
    return request<{ loan: LoanView }>(`/api/loans/${loanId}/emis`, { method: "POST", body: JSON.stringify({ date: date ?? null }) });
  },
  undoLastEmi(loanId: string) {
    return request<{ loan: LoanView }>(`/api/loans/${loanId}/emis`, { method: "DELETE" });
  },
  deleteLoan(loanId: string) {
    return request<{ ok: boolean }>(`/api/loans/${loanId}`, { method: "DELETE" });
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
  refreshFxRates(workspaceId: string) {
    return request<{ date: string | null; kept: number; currencies: string[] }>(`/api/workspaces/${workspaceId}/fx-rates/refresh`, { method: "POST" });
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
  listApprovalRules(workspaceId: string) {
    return request<{ rules: ApprovalRuleView[] }>(`/api/workspaces/${workspaceId}/approval-rules`);
  },
  createApprovalRule(workspaceId: string, body: ApprovalRuleBody) {
    return request<{ rule: ApprovalRuleView }>(`/api/workspaces/${workspaceId}/approval-rules`, { method: "POST", body: JSON.stringify(body) });
  },
  updateApprovalRule(workspaceId: string, ruleId: string, body: ApprovalRuleBody) {
    return request<{ rule: ApprovalRuleView }>(`/api/workspaces/${workspaceId}/approval-rules/${ruleId}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteApprovalRule(workspaceId: string, ruleId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/approval-rules/${ruleId}`, { method: "DELETE" });
  },
  reorderApprovalRules(workspaceId: string, ids: string[]) {
    return request<{ rules: ApprovalRuleView[] }>(`/api/workspaces/${workspaceId}/approval-rules`, { method: "PUT", body: JSON.stringify({ ids }) });
  },
  listDelegations(workspaceId: string) {
    return request<{ delegations: DelegationView[] }>(`/api/workspaces/${workspaceId}/delegations`);
  },
  createDelegation(workspaceId: string, body: { toUserId: string; startsOn: string; endsOn: string; note?: string | null }) {
    return request<{ delegation: { id: string } }>(`/api/workspaces/${workspaceId}/delegations`, { method: "POST", body: JSON.stringify(body) });
  },
  endDelegation(workspaceId: string, delegationId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/delegations/${delegationId}`, { method: "DELETE" });
  },
  approvalHistory(workspaceId: string, query: { approvalId?: string; before?: string } = {}) {
    const qs = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => Boolean(e[1]))).toString();
    return request<{ events: ApprovalEventView[]; nextBefore: string | null }>(`/api/workspaces/${workspaceId}/approval-history${qs ? `?${qs}` : ""}`);
  },
  incomeExpenseReport(workspaceId: string, query: ReportRange) {
    return request<IncomeExpenseReport & { baseCurrency: string; granularity: Granularity }>(`/api/workspaces/${workspaceId}/reports/income-expense?${new URLSearchParams(query)}`);
  },
  cashFlowReport(workspaceId: string, query: ReportRange) {
    return request<CashFlowReport & { baseCurrency: string; granularity: Granularity; hasCashAccounts: boolean }>(`/api/workspaces/${workspaceId}/reports/cash-flow?${new URLSearchParams(query)}`);
  },
  spendingReport(workspaceId: string, query: ReportRange) {
    return request<SpendingAnalysis & { baseCurrency: string; granularity: Granularity; previous: { from: string; to: string } }>(`/api/workspaces/${workspaceId}/reports/spending?${new URLSearchParams(query)}`);
  },
  budgetVsActualReport(workspaceId: string, query: ReportRange) {
    return request<{ baseCurrency: string; budgets: BudgetComparison[]; summary: ReturnType<typeof budgetSummary> }>(`/api/workspaces/${workspaceId}/reports/budgets?${new URLSearchParams(query)}`);
  },
  trendsReport(workspaceId: string, query: ReportRange) {
    return request<Trends & { baseCurrency: string; granularity: Granularity }>(`/api/workspaces/${workspaceId}/reports/trends?${new URLSearchParams(query)}`);
  },
  netWorthReport(workspaceId: string, query: ReportRange) {
    return request<
      | { baseCurrency: string; granularity: Granularity; hasAccounts: false }
      | {
          baseCurrency: string;
          granularity: Granularity;
          hasAccounts: true;
          netWorth: NetWorthReport;
          debt: DebtProgress;
          plan: { strategy: DebtStrategy; months: number | null; debtFreeMonth: string | null; totalInterestMinor: number; leftOut: number } | null;
        }
    >(`/api/workspaces/${workspaceId}/reports/net-worth?${new URLSearchParams(query)}`);
  },
  listWorkflows(workspaceId: string) {
    return request<{ workflows: WorkflowView[] }>(`/api/workspaces/${workspaceId}/workflows`);
  },
  createWorkflow(workspaceId: string, body: WorkflowBody) {
    return request<{ workflow: WorkflowView }>(`/api/workspaces/${workspaceId}/workflows`, { method: "POST", body: JSON.stringify(body) });
  },
  updateWorkflow(workspaceId: string, id: string, body: WorkflowBody) {
    return request<{ workflow: WorkflowView }>(`/api/workspaces/${workspaceId}/workflows/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteWorkflow(workspaceId: string, id: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/workflows/${id}`, { method: "DELETE" });
  },
  listPendingActions(workspaceId: string) {
    return request<PendingActionsState>(`/api/workspaces/${workspaceId}/pending-actions`);
  },
  setDualControl(workspaceId: string, enabled: boolean) {
    return request<PendingActionsState>(`/api/workspaces/${workspaceId}/pending-actions`, { method: "PUT", body: JSON.stringify({ enabled }) });
  },
  decidePendingAction(actionId: string, decision: "approve" | "reject") {
    return request<{ status: string; result: string | null }>(`/api/pending-actions/${actionId}`, { method: "POST", body: JSON.stringify({ decision }) });
  },
  cancelPendingAction(actionId: string) {
    return request<{ ok: boolean }>(`/api/pending-actions/${actionId}`, { method: "DELETE" });
  },
  getRetention(workspaceId: string) {
    return request<{ policy: RetentionPolicy; lastRunAt: string | null; kind: "personal" | "team"; name: string }>(`/api/workspaces/${workspaceId}/retention`);
  },
  setRetention(workspaceId: string, body: RetentionPolicy) {
    return request<{ policy: RetentionPolicy; lastRunAt: string | null; kind: "personal" | "team"; name: string }>(`/api/workspaces/${workspaceId}/retention`, { method: "PUT", body: JSON.stringify(body) });
  },
  applyRetention(workspaceId: string) {
    return request<{ removed: { deletedTransactions: number; unmatchedReceipts: number; notifications: number } }>(`/api/workspaces/${workspaceId}/retention/run`, { method: "POST" });
  },
  deleteWorkspace(workspaceId: string, confirmName: string) {
    return request<{ deleted: boolean }>(`/api/workspaces/${workspaceId}`, { method: "DELETE", body: JSON.stringify({ confirmName }) });
  },
  getBackups(workspaceId: string) {
    return request<BackupSettings>(`/api/workspaces/${workspaceId}/backups`);
  },
  setBackupSchedule(workspaceId: string, body: { enabled: boolean; frequency: BackupFrequency }) {
    return request<BackupSettings>(`/api/workspaces/${workspaceId}/backups`, { method: "PUT", body: JSON.stringify(body) });
  },
  backUpNow(workspaceId: string) {
    return request<{ backup: BackupView }>(`/api/workspaces/${workspaceId}/backups/run`, { method: "POST" });
  },
  restoreBackup(workspaceId: string, backupId: string) {
    return request<{ restored: RestoreResult }>(`/api/workspaces/${workspaceId}/backups/${backupId}/restore`, { method: "POST" });
  },
  restoreUpload(file: Blob) {
    return request<{ restored: RestoreResult }>("/api/workspaces/restore", { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" } });
  },
  reconciliationReport(workspaceId: string) {
    return request<ReconReport>(`/api/workspaces/${workspaceId}/reconciliation`);
  },
  listAudit(workspaceId: string, query: Record<string, string>) {
    return request<{ entries: AuditEntryView[]; nextBefore: number | null; actors: Array<{ id: string; name: string }> }>(`/api/workspaces/${workspaceId}/audit?${new URLSearchParams(query)}`);
  },
  verifyAudit(workspaceId: string) {
    return request<ChainCheck & { checkedAt: string }>(`/api/workspaces/${workspaceId}/audit/verify`);
  },
  listAccessTokens() {
    return request<{ tokens: AccessTokenView[] }>("/api/me/access-tokens");
  },
  createAccessToken(body: { name: string; scope: TokenScope; days: number }) {
    return request<{ token: string; accessToken: AccessTokenView }>("/api/me/access-tokens", { method: "POST", body: JSON.stringify(body) });
  },
  revokeAccessToken(id: string) {
    return request<{ ok: boolean }>(`/api/me/access-tokens/${id}`, { method: "DELETE" });
  },
  listWebhooks(workspaceId: string) {
    return request<{ webhooks: WebhookView[] }>(`/api/workspaces/${workspaceId}/webhooks`);
  },
  createWebhook(workspaceId: string, body: { url: string; events: WebhookEventType[] }) {
    return request<{ webhook: WebhookView; secret: string }>(`/api/workspaces/${workspaceId}/webhooks`, { method: "POST", body: JSON.stringify(body) });
  },
  updateWebhook(id: string, body: { url?: string; events?: WebhookEventType[]; enabled?: boolean }) {
    return request<{ webhook: WebhookView }>(`/api/webhooks/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteWebhook(id: string) {
    return request<{ ok: boolean }>(`/api/webhooks/${id}`, { method: "DELETE" });
  },
  rotateWebhookSecret(id: string) {
    return request<{ secret: string }>(`/api/webhooks/${id}/secret`, { method: "POST" });
  },
  testWebhook(id: string) {
    return request<{ delivery: DeliveryView }>(`/api/webhooks/${id}/test`, { method: "POST" });
  },
  listWebhookDeliveries(id: string) {
    return request<{ deliveries: DeliveryView[] }>(`/api/webhooks/${id}/deliveries`);
  },
  redeliverWebhook(id: string, deliveryId: string) {
    return request<{ delivery: DeliveryView }>(`/api/webhooks/${id}/deliveries/${deliveryId}/redeliver`, { method: "POST" });
  },
  getInboundEmail(workspaceId: string) {
    return request<InboundView>(`/api/workspaces/${workspaceId}/inbound-email`);
  },
  rotateInboundEmail(workspaceId: string) {
    return request<InboundView>(`/api/workspaces/${workspaceId}/inbound-email`, { method: "POST" });
  },
  setInboundEmail(workspaceId: string, body: { enabled: boolean; makeBills: boolean }) {
    return request<InboundView>(`/api/workspaces/${workspaceId}/inbound-email`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteInboundEmail(workspaceId: string) {
    return request<InboundView>(`/api/workspaces/${workspaceId}/inbound-email`, { method: "DELETE" });
  },
  calendarFeed() {
    return request<FeedStatus>("/api/me/calendar-feed");
  },
  createCalendarFeed() {
    return request<{ url: string; createdAt: string }>("/api/me/calendar-feed", { method: "POST" });
  },
  updateCalendarFeed(body: FeedSettings) {
    return request<FeedStatus>("/api/me/calendar-feed", { method: "PUT", body: JSON.stringify(body) });
  },
  disableCalendarFeed() {
    return request<FeedStatus>("/api/me/calendar-feed", { method: "DELETE" });
  },
  getFlowLink(workspaceId: string) {
    return request<{ configured: boolean; flowUrl: string | null; link: FlowLinkView | null }>(`/api/workspaces/${workspaceId}/flow`);
  },
  lookUpFlow(workspaceId: string, body: { token?: string | null; flowWorkspaceId?: string | null }) {
    return request<{ workspaces: Array<{ id: string; name: string }>; projects: Array<{ id: string; name: string }> }>(`/api/workspaces/${workspaceId}/flow/lookup`, { method: "POST", body: JSON.stringify(body) });
  },
  saveFlowLink(workspaceId: string, body: FlowLinkSettings & { token?: string | null; flowWorkspaceId: string; flowProjectId: string | null; paused?: boolean }) {
    return request<{ link: FlowLinkView }>(`/api/workspaces/${workspaceId}/flow`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteFlowLink(workspaceId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/flow`, { method: "DELETE" });
  },
  syncFlow(workspaceId: string) {
    return request<{ link: FlowLinkView }>(`/api/workspaces/${workspaceId}/flow/sync`, { method: "POST" });
  },
  getNotificationPrefs(workspaceId: string) {
    return request<{ prefs: NotificationPrefs }>(`/api/workspaces/${workspaceId}/notification-preferences`);
  },
  setNotificationPrefs(workspaceId: string, body: Omit<NotificationPrefs, "largeExpenseMinor"> & { largeExpenseMajor: string | null }) {
    return request<{ prefs: NotificationPrefs }>(`/api/workspaces/${workspaceId}/notification-preferences`, { method: "PUT", body: JSON.stringify(body) });
  },
  listAutomations(workspaceId: string) {
    return request<{ automations: AutomationView[] }>(`/api/workspaces/${workspaceId}/automations`);
  },
  createAutomation(workspaceId: string, body: AutomationBody) {
    return request<{ automation: AutomationView }>(`/api/workspaces/${workspaceId}/automations`, { method: "POST", body: JSON.stringify(body) });
  },
  updateAutomation(workspaceId: string, id: string, body: AutomationBody & { paused?: boolean }) {
    return request<{ automation: AutomationView }>(`/api/workspaces/${workspaceId}/automations/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteAutomation(workspaceId: string, id: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/automations/${id}`, { method: "DELETE" });
  },
  runAutomation(workspaceId: string, id: string) {
    return request<{ automation: AutomationView }>(`/api/workspaces/${workspaceId}/automations/${id}/run`, { method: "POST" });
  },
  listTransactionRules(workspaceId: string) {
    return request<{ rules: RuleView[] }>(`/api/workspaces/${workspaceId}/transaction-rules`);
  },
  createTransactionRule(workspaceId: string, body: TransactionRuleBody) {
    return request<{ rule: RuleView }>(`/api/workspaces/${workspaceId}/transaction-rules`, { method: "POST", body: JSON.stringify(body) });
  },
  updateTransactionRule(workspaceId: string, ruleId: string, body: TransactionRuleBody) {
    return request<{ rule: RuleView }>(`/api/workspaces/${workspaceId}/transaction-rules/${ruleId}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteTransactionRule(workspaceId: string, ruleId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/transaction-rules/${ruleId}`, { method: "DELETE" });
  },
  reorderTransactionRules(workspaceId: string, ids: string[]) {
    return request<{ rules: RuleView[] }>(`/api/workspaces/${workspaceId}/transaction-rules`, { method: "PUT", body: JSON.stringify({ ids }) });
  },
  applyTransactionRules(workspaceId: string, dryRun: boolean) {
    return request<{ changed: number; scanned: number }>(`/api/workspaces/${workspaceId}/transaction-rules/apply`, { method: "POST", body: JSON.stringify({ dryRun }) });
  },
  listScheduledExports(workspaceId: string) {
    return request<{ schedules: ScheduledExportView[] }>(`/api/workspaces/${workspaceId}/scheduled-exports`);
  },
  createScheduledExport(workspaceId: string, body: ScheduledExportBody) {
    return request<{ schedule: ScheduledExportView }>(`/api/workspaces/${workspaceId}/scheduled-exports`, { method: "POST", body: JSON.stringify(body) });
  },
  updateScheduledExport(workspaceId: string, id: string, body: ScheduledExportBody & { paused?: boolean }) {
    return request<{ schedule: ScheduledExportView }>(`/api/workspaces/${workspaceId}/scheduled-exports/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteScheduledExport(workspaceId: string, id: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/scheduled-exports/${id}`, { method: "DELETE" });
  },
  sendScheduledExport(workspaceId: string, id: string) {
    return request<{ schedule: ScheduledExportView }>(`/api/workspaces/${workspaceId}/scheduled-exports/${id}/send`, { method: "POST" });
  },
  dashboardLayout(workspaceId: string) {
    return request<{ widgets: Widget[]; custom: boolean }>(`/api/workspaces/${workspaceId}/dashboard-layout`);
  },
  saveDashboardLayout(workspaceId: string, widgets: Widget[] | null) {
    return request<{ widgets: Widget[]; custom: boolean }>(`/api/workspaces/${workspaceId}/dashboard-layout`, { method: "PUT", body: JSON.stringify({ widgets }) });
  },
  insightsReport(workspaceId: string, query: ReportRange) {
    return request<{ baseCurrency: string; compared: Array<{ from: string; to: string }>; unusual: Unusual[]; variances: CategoryVariance[]; savings: SavingsAnalysis }>(
      `/api/workspaces/${workspaceId}/reports/insights?${new URLSearchParams(query)}`,
    );
  },
  listDepartments(workspaceId: string) {
    return request<{ departments: DepartmentView[]; defaultDepartmentId: string | null }>(`/api/workspaces/${workspaceId}/departments`);
  },
  createDepartment(workspaceId: string, body: DepartmentBody) {
    return request<{ department: { id: string } }>(`/api/workspaces/${workspaceId}/departments`, { method: "POST", body: JSON.stringify(body) });
  },
  updateDepartment(workspaceId: string, departmentId: string, body: Partial<DepartmentBody> & { archived?: boolean }) {
    return request<{ department: { id: string } }>(`/api/workspaces/${workspaceId}/departments/${departmentId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteDepartment(workspaceId: string, departmentId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/departments/${departmentId}`, { method: "DELETE" });
  },
  listPolicies(workspaceId: string) {
    return request<{ policies: SpendingPolicyView[] }>(`/api/workspaces/${workspaceId}/spending-policies`);
  },
  createPolicy(workspaceId: string, body: SpendingPolicyBody) {
    return request<{ policy: SpendingPolicyView }>(`/api/workspaces/${workspaceId}/spending-policies`, { method: "POST", body: JSON.stringify(body) });
  },
  updatePolicy(workspaceId: string, policyId: string, body: SpendingPolicyBody) {
    return request<{ policy: SpendingPolicyView }>(`/api/workspaces/${workspaceId}/spending-policies/${policyId}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deletePolicy(workspaceId: string, policyId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/spending-policies/${policyId}`, { method: "DELETE" });
  },
  checkPolicies(workspaceId: string, body: { budgetPoolId: string; amountMajor: string; currency: string; date: string; categoryId: string | null; merchant: string | null; hasReceipt: boolean }) {
    return request<{
      violations: PolicyViolation[];
      lateSubmission: { deadline: string; daysLate: number; enforcement: "flag" | "block" } | null;
      memberLimit: { limitMinor: number; spentMinor: number; remainingMinor: number; over: boolean; overByMinor: number; period: MemberLimitPeriod } | null;
    }>(`/api/workspaces/${workspaceId}/policy-check`, { method: "POST", body: JSON.stringify(body) });
  },
  poolFunding(poolId: string) {
    return request<PoolFunding>(`/api/budget-pools/${poolId}/contributions`);
  },
  addContribution(poolId: string, body: { amountMajor: string; date: string; note?: string | null; forUserId?: string | null }) {
    return request<{ contribution: { id: string } }>(`/api/budget-pools/${poolId}/contributions`, { method: "POST", body: JSON.stringify(body) });
  },
  removeContribution(contributionId: string) {
    return request<{ ok: boolean }>(`/api/pool-contributions/${contributionId}`, { method: "DELETE" });
  },
  setPoolAllocation(poolId: string, body: { mode: AllocationMode; targetMajor: string | null; shares: Array<{ userId: string; value: string }> }) {
    return request<{ ok: boolean }>(`/api/budget-pools/${poolId}/allocation`, { method: "PUT", body: JSON.stringify(body) });
  },
  remindContributors(poolId: string) {
    return request<{ reminded: number }>(`/api/budget-pools/${poolId}/contributions/remind`, { method: "POST" });
  },
  updatePoolRules(poolId: string, body: { approverIds: string[]; autoApproveUpToMajor: string | null; memberLimitMajor: string | null; memberLimits: Array<{ userId: string; limitMajor: string }>; memberLimitPeriod: MemberLimitPeriod }) {
    return request<{ pool: BudgetPool }>(`/api/budget-pools/${poolId}`, { method: "PUT", body: JSON.stringify(body) });
  },
  listReimbursements(workspaceId: string) {
    return request<{ reimbursements: ReimbursementView[]; payouts: PayoutView[]; canPay: boolean }>(`/api/workspaces/${workspaceId}/reimbursements`);
  },
  createPayout(workspaceId: string, body: { reimbursementIds: string[]; method: PayoutMethod; reference?: string | null; paidOn: string }) {
    return request<{ payout: { id: string; amountMinor: number; currency: string } }>(`/api/workspaces/${workspaceId}/payouts`, { method: "POST", body: JSON.stringify(body) });
  },
  undoPayout(workspaceId: string, payoutId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/payouts/${payoutId}`, { method: "DELETE" });
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
  updateMember(workspaceId: string, userId: string, role: MemberRole, customRoleId?: string | null) {
    return request<{ member: { userId: string; role: MemberRole; customRoleId: string | null } }>(
      `/api/workspaces/${workspaceId}/members`,
      { method: "PATCH", body: JSON.stringify({ userId, role, ...(customRoleId !== undefined ? { customRoleId } : {}) }) },
    );
  },
  listRoles(workspaceId: string) {
    return request<{ roles: CustomRoleView[] }>(`/api/workspaces/${workspaceId}/roles`);
  },
  createRole(workspaceId: string, body: { name: string; permissions: PermissionAction[] }) {
    return request<{ role: CustomRoleView }>(`/api/workspaces/${workspaceId}/roles`, { method: "POST", body: JSON.stringify(body) });
  },
  updateRole(workspaceId: string, roleId: string, body: { name?: string; permissions?: PermissionAction[] }) {
    return request<{ role: CustomRoleView }>(`/api/workspaces/${workspaceId}/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  deleteRole(workspaceId: string, roleId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/roles/${roleId}`, { method: "DELETE" });
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
      format: ExportFormat;
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
