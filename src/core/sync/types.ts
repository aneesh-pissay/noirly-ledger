import type {
  ApprovalStatus,
  BudgetPeriod,
  MemberRole,
  RecurrenceFrequency,
  TransactionType,
  WorkspaceKind,
} from "@/src/core/models/enums";
import type { MoneyMinor } from "@/src/core/money";
import type { AccountKind } from "@/src/core/accounts";
import type { Clearing } from "@/src/core/clearing";
import type { SplitLine } from "@/src/core/splits";
import type { RolloverMode } from "@/src/core/budgets/rollover";
import type { RevisionReason } from "@/src/core/budgets/revisions";

export type {
  ApprovalStatus,
  BudgetPeriod,
  MemberRole,
  RecurrenceFrequency,
  TransactionType,
  WorkspaceKind,
};

export type Workspace = {
  id: string;
  kind: WorkspaceKind;
  name: string;
  slug: string;
  ownerUserId: string;
  baseCurrency: string;
  /** Month (1–12) its financial year starts in. */
  fiscalYearStartMonth: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceWithRole = Workspace & { role: MemberRole };

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  workspaceId: string;
  name: string;
  icon: string;
  color: string;
  isSystem: boolean;
  /** Set on a subcategory: its top-level category. */
  parentId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  byMonthDay?: number;
  until?: string | null;
};

export type Transaction = {
  id: string;
  workspaceId: string;
  type: TransactionType;
  amountMinor: MoneyMinor;
  currency: string;
  baseAmountMinor: MoneyMinor;
  categoryId: string | null;
  budgetPoolId: string | null;
  /** The account it was paid from or into, if any. */
  accountId: string | null;
  /** Transfers: the account the money went to, and the amount it received in that account's currency. */
  toAccountId: string | null;
  toAmountMinor: MoneyMinor | null;
  /** Refunds: the expense this takes back. */
  refundOfId: string | null;
  /** Expenses: how much refunds have taken back so far, in its currency. */
  refundedMinor: MoneyMinor;
  /** Against the bank: pending, cleared, or reconciled to a statement. */
  clearing: Clearing;
  /** Split across categories; empty when it isn't, and then categoryId applies. */
  splits: SplitLine[];
  tags: string[];
  /** Who was paid, or paid you. */
  merchant: string | null;
  projectId: string | null;
  date: string;
  note: string | null;
  receiptUrl: string | null;
  receiptStorageKey: string | null;
  isRecurring: boolean;
  recurrence: RecurrenceRule | null;
  recurringParentId: string | null;
  createdById: string;
  approvalRequestId: string | null;
  isPosted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** Where money is kept or owed. balanceMinor is what's in it today, or for cards and loans what's owed, in its currency. */
export type Account = {
  id: string;
  workspaceId: string;
  name: string;
  kind: AccountKind;
  currency: string;
  openingBalanceMinor: MoneyMinor;
  openingDate: string;
  institution: string | null;
  archived: boolean;
  balanceMinor: MoneyMinor;
  /** The balance leaving out pending transactions: what the bank should show. */
  clearedBalanceMinor: MoneyMinor;
  pendingCount: number;
  /** Dated after today, so not in the balance yet. */
  scheduledCount: number;
  transactionCount: number;
  reconciledThrough: string | null;
  reconciledBalanceMinor: MoneyMinor | null;
};

export type Budget = {
  id: string;
  workspaceId: string;
  categoryId: string;
  period: BudgetPeriod;
  periodStart: string | null;
  periodEnd: string | null;
  limitAmountMinor: MoneyMinor;
  currency: string;
  alertThresholdPct: number;
  /** What carries into the next period, counted from rolloverSince. */
  rollover: RolloverMode;
  rolloverSince: string | null;
  /** Custom budgets: moves on to the next stretch of the same length when its dates pass. */
  renew: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BudgetPool = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  limitAmountMinor: MoneyMinor;
  currency: string;
  currentSpendMinor: MoneyMinor;
  periodStart: string | null;
  periodEnd: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavingsGoal = {
  id: string;
  workspaceId: string;
  name: string;
  targetAmountMinor: MoneyMinor;
  currentAmountMinor: MoneyMinor;
  currency: string;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ApprovalRequest = {
  id: string;
  workspaceId: string;
  transactionId: string;
  budgetPoolId: string;
  submittedById: string;
  status: ApprovalStatus;
  reviewedById: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FxRate = {
  id: string;
  workspaceId: string;
  currency: string;
  rateToBaseScaled: number;
  effectiveFrom: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationKind =
  | "budget.threshold"
  | "approval.requested"
  | "approval.decided"
  | "goal.reached"
  | "recurring.due";

export type InAppNotification = {
  id: string;
  userId: string;
  workspaceId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type MemberView = {
  userId: string;
  email: string;
  displayName: string;
  role: MemberRole;
};

export type ApprovalView = ApprovalRequest & {
  transaction: Transaction;
  submitterName: string;
  /** Whether the viewer may approve or reject it (not their own, unless nobody else can). */
  canDecide: boolean;
};

export type CreateBudgetPoolInput = {
  workspaceId: string;
  name: string;
  description?: string | null;
  limitAmountMinor: number;
  currency?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type SubmitExpenseInput = {
  workspaceId: string;
  budgetPoolId: string;
  amountMinor: number;
  currency: string;
  categoryId?: string | null;
  date: string;
  note?: string | null;
  receiptUrl?: string | null;
  receiptStorageKey?: string | null;
};

export type DecideApprovalInput = {
  approvalId: string;
  decision: "approved" | "rejected";
  reviewNote?: string | null;
};

export type CreateWorkspaceInput = {
  name: string;
  kind: "team";
  baseCurrency: string;
};

export type ListTransactionsQuery = {
  workspaceId: string;
  cursor?: string;
  limit?: number;
  categoryId?: string;
  budgetPoolId?: string;
  accountId?: string;
  tag?: string;
  /** A merchant's name, matched however it's spelled. */
  merchant?: string;
  projectId?: string;
  from?: string;
  to?: string;
  recurringOnly?: boolean;
  type?: TransactionType;
};

export type CreateTransactionInput = {
  workspaceId: string;
  type: TransactionType;
  amountMinor: number;
  currency: string;
  categoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  toAmountMinor?: number | null;
  refundOfId?: string | null;
  /** New transactions are pending or cleared; only reconciling an account makes them reconciled. */
  clearing?: Clearing;
  /** Two or more lines that add up to the amount; null removes a split. */
  splits?: SplitLine[] | null;
  tags?: string[] | null;
  merchant?: string | null;
  projectId?: string | null;
  date: string;
  note?: string | null;
  receiptUrl?: string | null;
  receiptStorageKey?: string | null;
  recurrence?: RecurrenceRule | null;
};

export type UpdateTransactionInput = Partial<
  Omit<CreateTransactionInput, "workspaceId">
>;

export type CreateCategoryInput = {
  workspaceId: string;
  name: string;
  icon: string;
  color: string;
  parentId?: string | null;
};

export type UpsertBudgetInput = {
  workspaceId: string;
  categoryId: string;
  period: BudgetPeriod;
  periodStart?: string | null;
  periodEnd?: string | null;
  limitAmountMinor: number;
  currency?: string;
  alertThresholdPct?: number;
  rollover?: RolloverMode;
  /** The day carrying starts from; defaults to the start of the current period when rollover is turned on. */
  rolloverSince?: string | null;
  renew?: boolean;
  /** Server-side: why the limit changed, for the budget's history (defaults to created or edited). */
  revisionReason?: RevisionReason;
};

export type BudgetRevisionRecord = {
  id: string;
  budgetId: string;
  categoryId: string;
  period: BudgetPeriod;
  previousLimitMinor: MoneyMinor | null;
  limitMinor: MoneyMinor | null;
  reason: RevisionReason;
  note: string | null;
  moveId: string | null;
  otherBudgetId: string | null;
  createdAt: string;
};

/** What an expense being entered would do to one budget. */
export type BudgetImpact = {
  budgetId: string;
  categoryId: string;
  period: BudgetPeriod;
  availableMinor: MoneyMinor;
  spentMinor: MoneyMinor;
  addMinor: MoneyMinor;
  /** Left after this expense (negative when over). */
  leftMinor: MoneyMinor;
  state: "ok" | "near" | "over";
  alreadyOver: boolean;
};

export type BudgetTemplateSummary = {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  /** Its amounts are shares of monthly income, asked for when applying. */
  needsIncome: boolean;
  lineCount: number;
};

export type UpsertSavingsGoalInput = {
  workspaceId: string;
  name: string;
  targetAmountMinor: number;
  currentAmountMinor?: number;
  currency?: string;
  targetDate?: string | null;
};

export type UpsertFxRateInput = {
  workspaceId: string;
  currency: string;
  rateToBaseScaled: number;
  effectiveFrom: string;
};

/** "fy" is the financial year to date. */
export type DateRangePreset = "7d" | "30d" | "90d" | "mtd" | "fy";

export type DashboardSummary = {
  baseCurrency: string;
  range: { from: string; to: string };
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  byCategory: Array<{
    categoryId: string | null;
    name: string;
    color: string;
    amountMinor: number;
  }>;
  overTime: Array<{ date: string; expenseMinor: number; incomeMinor: number }>;
  budgets: Array<{
    budget: Budget;
    spentMinor: number;
    remainingMinor: number;
    /** Carried in from earlier periods (negative when overspending carries), and limit plus that. */
    carriedInMinor: number;
    availableMinor: number;
    /** The current period's first and last days; a yearly budget runs over the financial year. */
    periodFrom: string;
    periodTo: string;
  }>;
};

/** Backend-agnostic data access. */
export interface LedgerSyncProvider {
  listWorkspaces(): Promise<WorkspaceWithRole[]>;
  getWorkspace(id: string): Promise<WorkspaceWithRole>;
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
  listCategories(workspaceId: string): Promise<Category[]>;
  createCategory(input: CreateCategoryInput): Promise<Category>;
  updateCategory(id: string, patch: Partial<Category>): Promise<Category>;
  archiveCategory(id: string): Promise<void>;
  listTransactions(
    query: ListTransactionsQuery,
  ): Promise<{ items: Transaction[]; nextCursor?: string }>;
  getTransaction(id: string): Promise<Transaction>;
  createTransaction(input: CreateTransactionInput): Promise<Transaction>;
  updateTransaction(id: string, patch: UpdateTransactionInput): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  listBudgets(workspaceId: string): Promise<Budget[]>;
  upsertBudget(input: UpsertBudgetInput): Promise<Budget>;
  deleteBudget(id: string): Promise<void>;
  listBudgetPools(workspaceId: string): Promise<BudgetPool[]>;
  getBudgetPool(id: string): Promise<BudgetPool>;
  createBudgetPool(input: CreateBudgetPoolInput): Promise<BudgetPool>;
  listSavingsGoals(workspaceId: string): Promise<SavingsGoal[]>;
  upsertSavingsGoal(input: UpsertSavingsGoalInput): Promise<SavingsGoal>;
  contributeToGoal(id: string, amountMinor: number): Promise<SavingsGoal>;
  deleteSavingsGoal(id: string): Promise<void>;
  listApprovals(query: {
    workspaceId: string;
    status?: ApprovalStatus[];
  }): Promise<ApprovalView[]>;
  submitExpense(input: SubmitExpenseInput): Promise<{
    transaction: Transaction;
    approval: ApprovalRequest;
  }>;
  decideApproval(input: DecideApprovalInput): Promise<{
    approval: ApprovalRequest;
    transaction: Transaction;
    pool: BudgetPool;
  }>;
  listMembers(workspaceId: string): Promise<MemberView[]>;
  listNotifications(): Promise<InAppNotification[]>;
  markNotificationRead(id: string): Promise<void>;
  listFxRates(workspaceId: string): Promise<FxRate[]>;
  upsertFxRate(input: UpsertFxRateInput): Promise<FxRate>;
  getDashboardSummary(
    workspaceId: string,
    preset: DateRangePreset,
  ): Promise<DashboardSummary>;
}

/** Something the workspace spends on over time; totals are in base currency, spending net of refunds. */
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  archived: boolean;
  spentMinor: MoneyMinor;
  incomeMinor: MoneyMinor;
  transactionCount: number;
};

export type TagSummary = { tag: string; count: number };
export type MerchantSummary = { key: string; name: string; count: number; spentMinor: MoneyMinor };

/** Envelopes on top of accounts, in base currency; see src/core/envelopes.ts. */
export type EnvelopeState = {
  started: boolean;
  since: string | null;
  baseCurrency: string;
  readyToAssignMinor: MoneyMinor;
  /** Cash, bank and wallet balances today, and what's owed on credit cards. */
  cashMinor: MoneyMinor;
  cardDebtMinor: MoneyMinor;
  /** Spending since the start with no envelope (uncategorized); it came out of Ready to assign. */
  uncategorizedSpentMinor: MoneyMinor;
  /** One per top-level category. */
  envelopes: Array<{ categoryId: string; fundedMinor: MoneyMinor; spentMinor: MoneyMinor; balanceMinor: MoneyMinor }>;
  missingRates: string[];
};

export type EnvelopeMoveRecord = {
  id: string;
  /** null is Ready to assign. */
  fromCategoryId: string | null;
  toCategoryId: string | null;
  amountMinor: MoneyMinor;
  note: string | null;
  createdAt: string;
};

/** A month's zero-based plan in base currency: income to plan with, what budgets assign, and what's left. */
export type MonthPlan = {
  month: string;
  baseCurrency: string;
  /** What the month is planned with; null until set, and then income received counts. */
  expectedIncomeMinor: MoneyMinor | null;
  receivedIncomeMinor: MoneyMinor;
  incomeMinor: MoneyMinor;
  assignedMinor: MoneyMinor;
  leftMinor: MoneyMinor;
  state: "balanced" | "unassigned" | "overassigned";
  /** Per category with budgets: the month's share of them, and its monthly budget (the one edited here) if any. */
  lines: Array<{ categoryId: string; monthlyMinor: MoneyMinor; monthlyBudgetId: string | null; monthlyLimitMinor: MoneyMinor | null }>;
};

/** What a workspace has and owes across its accounts, in its base currency. */
export type NetWorth = {
  baseCurrency: string;
  assetsMinor: MoneyMinor;
  liabilitiesMinor: MoneyMinor;
  netMinor: MoneyMinor;
  /** baseBalanceMinor is null when the account's currency has no FX rate yet. */
  accounts: Array<{ id: string; name: string; kind: AccountKind; currency: string; archived: boolean; balanceMinor: MoneyMinor; baseBalanceMinor: MoneyMinor | null }>;
  /** Month ends, then today. */
  history: Array<{ date: string; assetsMinor: MoneyMinor; liabilitiesMinor: MoneyMinor; netMinor: MoneyMinor }>;
  missingRates: string[];
};

/** Something known to be coming: a future-dated transaction or a recurring rule's next occurrence. */
export type UpcomingItem = {
  date: string;
  /** The note, or the category's name. */
  label: string;
  type: TransactionType;
  amountMinor: MoneyMinor;
  currency: string;
  accountId: string | null;
  toAccountId: string | null;
  toAmountMinor: MoneyMinor | null;
  categoryId: string | null;
  recurring: boolean;
};

/** Where open accounts are heading over a window, and what's free to spend by its end. */
export type Projection = {
  baseCurrency: string;
  from: string;
  through: string;
  availableToSpendMinor: MoneyMinor;
  accounts: Array<{
    id: string;
    name: string;
    kind: AccountKind;
    currency: string;
    todayMinor: MoneyMinor;
    projectedMinor: MoneyMinor;
    /** The least in it (or most owed) on the way, and the day; null date when it never dips. */
    lowestMinor: MoneyMinor;
    lowestDate: string | null;
  }>;
  upcoming: UpcomingItem[];
  missingRates: string[];
};
