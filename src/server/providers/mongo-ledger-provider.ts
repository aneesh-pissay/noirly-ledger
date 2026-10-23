import { Types } from "mongoose";
import type {
  ApprovalRequest,
  ApprovalView,
  Budget,
  BudgetPool,
  Category,
  CreateBudgetPoolInput,
  CreateCategoryInput,
  CreateTransactionInput,
  CreateWorkspaceInput,
  DateRangePreset,
  DashboardSummary,
  DecideApprovalInput,
  FxRate,
  InAppNotification,
  LedgerSyncProvider,
  ListTransactionsQuery,
  MemberView,
  SavingsGoal,
  SubmitExpenseInput,
  Transaction,
  UpdateTransactionInput,
  UpsertBudgetInput,
  UpsertFxRateInput,
  UpsertSavingsGoalInput,
  Workspace,
  WorkspaceWithRole,
} from "@/src/core/sync/types";
import type { ApprovalStatus, MemberRole } from "@/src/core/models/enums";
import { toBaseAmount } from "@/src/server/fx";
import { dashboardRange, isoDate, periodWindow } from "@/src/core/budgets/period";
import { withDb } from "@/src/server/db/mongodb";
import {
  ApprovalRequest as ApprovalModel,
  Budget as BudgetModel,
  BudgetPool as BudgetPoolModel,
  Category as CategoryModel,
  FxRate as FxRateModel,
  LedgerUser,
  Notification as NotificationModel,
  SavingsGoal as SavingsGoalModel,
  Transaction as TransactionModel,
  Workspace as WorkspaceModel,
  WorkspaceMember,
} from "@/src/server/models";
import {
  mapApproval,
  mapBudget,
  mapBudgetPool,
  mapCategory,
  mapFxRate,
  mapNotification,
  mapSavingsGoal,
  mapTransaction,
  mapWorkspace,
} from "@/src/server/mappers";
import { ApiError } from "@/src/server/api/http";
import { seedSystemCategories } from "@/src/server/categories/seed";
import { listMembers, requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { can } from "@/src/core/permissions/can";
import {
  afterCursorFilter,
  decodeTransactionCursor,
  encodeTransactionCursor,
} from "@/src/server/transactions/cursor";
import { receiptUrlFor, receiptWorkspaceId } from "@/src/server/storage/receipt-keys";
import { publishMany } from "@/src/server/realtime/publish";
import { notifyUsers } from "@/src/server/notifications/notify";
import { maybeNotifyBudgetThreshold } from "@/src/server/notifications/budget-threshold";
import { assertTransactionAccount, resolveTransfer } from "@/src/server/accounts";
import { expenseToRefund, refundedByExpense } from "@/src/server/refunds";
import { spendSign } from "@/src/core/refunds";
import { clearingOf, reconciledChange } from "@/src/core/clearing";
import { checkParent, topLevelOf } from "@/src/core/categories";
import { budgetStatus } from "@/src/server/budgets";
import { recordRevision } from "@/src/server/budget-revisions";
import { canRollOver } from "@/src/core/budgets/rollover";
import { labelFields } from "@/src/server/labels";
import { assertTransactionProject } from "@/src/server/projects";
import { merchantKey } from "@/src/core/labels";
import { defaultFiscalStart } from "@/src/core/locale-format";
import { assertSplits, refundSplits, storedSplits, type StoredSplit } from "@/src/server/splits";

type ProviderContext = {
  userId: string;
};

function oid(id: string) {
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/i.test(id)) {
    throw new ApiError(400, "invalid_request", "Invalid id");
  }
  return new Types.ObjectId(id);
}

/** Expenses with how much refunds have taken back so far. */
async function withRefunded(items: Transaction[]) {
  const expenses = items.filter((t) => t.type === "expense");
  if (!expenses.length) return items;
  const refunded = await refundedByExpense(expenses.map((t) => new Types.ObjectId(t.id)));
  return items.map((t) => (refunded.has(t.id) ? { ...t, refundedMinor: refunded.get(t.id)! } : t));
}

function optionalOid(id: string | null | undefined) {
  return id ? oid(id) : null;
}

/** A category id must name a live category of the same workspace. */
/** A parent must be a live top-level category in the workspace, and a category with subcategories stays top-level. */
async function assertParent(workspaceId: Types.ObjectId, categoryId: Types.ObjectId | null, parentId: string | null) {
  if (!parentId) return;
  const parent = Types.ObjectId.isValid(parentId)
    ? await CategoryModel.findOne({ _id: new Types.ObjectId(parentId), workspaceId, deletedAt: null, archivedAt: null }).select("parentId").lean()
    : null;
  const hasChildren = categoryId ? Boolean(await CategoryModel.exists({ parentId: categoryId, deletedAt: null })) : false;
  const result = checkParent({
    categoryId: categoryId ? String(categoryId) : null,
    hasChildren,
    parent: parent ? { id: String(parent._id), parentId: parent.parentId ? String(parent.parentId) : null } : null,
    parentId,
  });
  if (!result.ok) throw new ApiError(400, "invalid_request", result.error);
}

async function assertCategory(workspaceId: Types.ObjectId, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const exists = await CategoryModel.exists({
    _id: oid(categoryId),
    workspaceId,
    deletedAt: null,
  });
  if (!exists) throw new ApiError(400, "invalid_request", "Category is not in this workspace");
}

/**
 * A receipt key must have been uploaded to this workspace. The link is built
 * from it here; a URL sent by the client is never stored.
 */
function receiptFields(workspaceId: Types.ObjectId, key: string | null | undefined) {
  if (!key) return { receiptStorageKey: null, receiptUrl: null };
  if (receiptWorkspaceId(key) !== workspaceId.toString()) {
    throw new ApiError(400, "invalid_request", "Receipt is not in this workspace");
  }
  return { receiptStorageKey: key, receiptUrl: receiptUrlFor(key) };
}

/**
 * Who may change a transaction: whoever created it, or the workspace owner.
 * (In a personal workspace that's the same person.)
 */
async function requireTransactionEditor(userId: string, doc: { workspaceId: Types.ObjectId; createdById: Types.ObjectId }) {
  const role = await requireMembershipRole(userId, doc.workspaceId.toString());
  if (doc.createdById.toString() !== userId && !can(role, "workspace.manage")) {
    throw new ApiError(403, "forbidden", "You can only change transactions you added");
  }
  return role;
}

async function requireMembership(userId: string, workspaceId: string) {
  const membership = await WorkspaceMember.findOne({
    workspaceId: oid(workspaceId),
    userId: oid(userId),
  }).lean();
  if (!membership) {
    throw new ApiError(403, "forbidden", "Not a workspace member");
  }
  return membership;
}

async function requireWorkspace(userId: string, workspaceId: string) {
  await requireMembership(userId, workspaceId);
  const workspace = await WorkspaceModel.findById(workspaceId);
  if (!workspace) {
    throw new ApiError(404, "not_found", "Workspace not found");
  }
  return workspace;
}


export function createMongoLedgerProvider(
  ctx: ProviderContext,
): LedgerSyncProvider {
  return {
    async listWorkspaces(): Promise<WorkspaceWithRole[]> {
      return withDb(async () => {
        const memberships = await WorkspaceMember.find({
          userId: oid(ctx.userId),
        }).lean();
        const ids = memberships.map((m) => m.workspaceId);
        const roleById = new Map(
          memberships.map((m) => [m.workspaceId.toString(), m.role as MemberRole]),
        );
        const workspaces = await WorkspaceModel.find({ _id: { $in: ids } });
        return workspaces.map((doc) => ({
          ...mapWorkspace(doc),
          role: roleById.get(doc._id.toString()) ?? "member",
        }));
      });
    },

    async getWorkspace(id: string): Promise<WorkspaceWithRole> {
      return withDb(async () => {
        const membership = await requireMembership(ctx.userId, id);
        const workspace = await WorkspaceModel.findById(id);
        if (!workspace) {
          throw new ApiError(404, "not_found", "Workspace not found");
        }
        return {
          ...mapWorkspace(workspace),
          role: membership.role as MemberRole,
        };
      });
    },

    async createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
      return withDb(async () => {
        const slugBase =
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40) || "team";
        let slug = slugBase;
        let n = 0;
        while (await WorkspaceModel.exists({ slug })) {
          n += 1;
          slug = `${slugBase}-${n}`;
        }

        const workspace = await WorkspaceModel.create({
          kind: "team",
          name: input.name.trim(),
          slug,
          ownerUserId: oid(ctx.userId),
          baseCurrency: input.baseCurrency.toUpperCase(),
          purpose: input.purpose ?? "team",
        });

        await WorkspaceMember.create({
          workspaceId: workspace._id,
          userId: oid(ctx.userId),
          role: "owner",
        });
        await seedSystemCategories(workspace._id, input.purpose ?? "team");

        return mapWorkspace(workspace);
      });
    },

    async listCategories(workspaceId: string): Promise<Category[]> {
      return withDb(async () => {
        await requireMembership(ctx.userId, workspaceId);
        const docs = await CategoryModel.find({
          workspaceId: oid(workspaceId),
          deletedAt: null,
          archivedAt: null,
        }).sort({ name: 1 });
        return docs.map((doc) => mapCategory(doc));
      });
    },

    async createCategory(input: CreateCategoryInput): Promise<Category> {
      return withDb(async () => {
        await requireAction(ctx.userId, input.workspaceId, "budget.manage");
        await assertParent(oid(input.workspaceId), null, input.parentId ?? null);
        const doc = await CategoryModel.create({
          workspaceId: oid(input.workspaceId),
          name: input.name.trim(),
          icon: input.icon,
          color: input.color,
          isSystem: false,
          parentId: optionalOid(input.parentId),
        });
        return mapCategory(doc);
      });
    },

    async updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
      return withDb(async () => {
        const doc = await CategoryModel.findOne({ _id: oid(id), deletedAt: null });
        if (!doc) throw new ApiError(404, "not_found", "Category not found");
        await requireAction(ctx.userId, doc.workspaceId.toString(), "budget.manage");
        if (patch.name) doc.name = patch.name;
        if (patch.icon) doc.icon = patch.icon;
        if (patch.color) doc.color = patch.color;
        if (patch.parentId !== undefined) {
          await assertParent(doc.workspaceId, doc._id, patch.parentId);
          doc.parentId = optionalOid(patch.parentId);
        }
        await doc.save();
        return mapCategory(doc);
      });
    },

    async archiveCategory(id: string): Promise<void> {
      return withDb(async () => {
        const doc = await CategoryModel.findOne({ _id: oid(id), deletedAt: null });
        if (!doc) throw new ApiError(404, "not_found", "Category not found");
        await requireAction(ctx.userId, doc.workspaceId.toString(), "budget.manage");
        if (doc.isSystem) {
          doc.archivedAt = new Date();
        } else {
          doc.deletedAt = new Date();
        }
        await doc.save();
        // Its subcategories stay, as top-level categories.
        await CategoryModel.updateMany({ parentId: doc._id }, { $set: { parentId: null } });
      });
    },

    async listTransactions(
      query: ListTransactionsQuery,
    ): Promise<{ items: Transaction[]; nextCursor?: string }> {
      return withDb(async () => {
        await requireMembership(ctx.userId, query.workspaceId);
        const limit = Math.min(query.limit ?? 50, 500);
        const filter: Record<string, unknown> = {
          workspaceId: oid(query.workspaceId),
          deletedAt: null,
        };
        const all: object[] = [];
        // A category's transactions include split ones with a line in it.
        if (query.categoryId) all.push({ $or: [{ categoryId: oid(query.categoryId) }, { "splits.categoryId": oid(query.categoryId) }] });
        if (query.budgetPoolId) filter.budgetPoolId = oid(query.budgetPoolId);
        // An account's transactions include transfers into it.
        if (query.tag) filter.tags = query.tag.toLowerCase().replace(/^#+/, "");
        if (query.merchant) filter.merchantKey = merchantKey(query.merchant);
        if (query.projectId) filter.projectId = oid(query.projectId);
        if (query.accountId) all.push({ $or: [{ accountId: oid(query.accountId) }, { toAccountId: oid(query.accountId) }] });
        if (all.length) filter.$and = all;
        if (query.type) filter.type = query.type;
        if (query.recurringOnly) {
          filter.isRecurring = true;
          filter.recurringParentId = null;
        }
        if (query.from || query.to) {
          filter.date = {
            ...(query.from ? { $gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
          };
        }
        let after: ReturnType<typeof afterCursorFilter> | null = null;
        if (query.cursor) {
          let position = decodeTransactionCursor(query.cursor);
          // Older clients may still hold a bare-id cursor from before.
          if (!position) {
            const previous = await TransactionModel.findOne({
              _id: oid(query.cursor),
              workspaceId: oid(query.workspaceId),
            }).select("date");
            if (!previous) throw new ApiError(400, "invalid_request", "Invalid cursor");
            position = { date: previous.date, id: previous._id };
          }
          after = afterCursorFilter(position);
        }
        const docs = await TransactionModel.find(after ? { $and: [filter, after] } : filter)
          .sort({ date: -1, _id: -1 })
          .limit(limit + 1);
        const extra = docs.length > limit;
        const page = extra ? docs.slice(0, limit) : docs;
        const last = page[page.length - 1];
        return {
          items: await withRefunded(page.map((doc) => mapTransaction(doc))),
          nextCursor: extra && last ? encodeTransactionCursor(last) : undefined,
        };
      });
    },

    async getTransaction(id: string): Promise<Transaction> {
      return withDb(async () => {
        const doc = await TransactionModel.findOne({ _id: oid(id), deletedAt: null });
        if (!doc) throw new ApiError(404, "not_found", "Transaction not found");
        await requireMembership(ctx.userId, doc.workspaceId.toString());
        return (await withRefunded([mapTransaction(doc)]))[0]!;
      });
    },

    async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
      return withDb(async () => {
        const workspace = await requireWorkspace(ctx.userId, input.workspaceId);
        if (input.clearing === "reconciled") {
          throw new ApiError(400, "invalid_request", "Transactions become reconciled when you reconcile their account");
        }
        let refundOf: Awaited<ReturnType<typeof expenseToRefund>> | null = null;
        if (input.type === "refund") {
          refundOf = await expenseToRefund(workspace._id, input);
          if (input.recurrence) throw new ApiError(400, "invalid_request", "A refund can't repeat");
        } else if (input.refundOfId) {
          throw new ApiError(400, "invalid_request", "Only a refund reverses an expense");
        }
        // A refund sits in its expense's category, and goes back to its account unless you pick another.
        const categoryId = refundOf ? refundOf.categoryId?.toString() ?? null : input.categoryId;
        const accountId = refundOf && !input.accountId ? refundOf.accountId?.toString() ?? null : input.accountId;
        await assertCategory(workspace._id, categoryId);
        // A split has no category of its own; a refund of one splits the same way.
        let lines: Array<{ categoryId: Types.ObjectId | null; amountMinor: number; note?: string | null }> = [];
        if (refundOf?.splits?.length) {
          lines = refundSplits(refundOf.splits as StoredSplit[], input.amountMinor);
        } else if (input.splits?.length) {
          if (refundOf) throw new ApiError(400, "invalid_request", "A refund splits like its expense");
          assertSplits(input.type, input.amountMinor, input.splits);
          if (categoryId) throw new ApiError(400, "invalid_request", "A split transaction takes its categories from its lines");
          for (const line of input.splits) await assertCategory(workspace._id, line.categoryId);
          lines = input.splits.map((line) => ({ categoryId: optionalOid(line.categoryId), amountMinor: line.amountMinor, note: line.note ?? null }));
        }
        await assertTransactionAccount(workspace._id, accountId, input.currency, refundOf?.accountId?.toString() ?? null);
        const transfer = await resolveTransfer(workspace._id, input);
        // A refund keeps its expense's merchant, project and tags unless it names its own.
        const labels = labelFields({
          tags: input.tags ?? refundOf?.tags ?? [],
          merchant: input.merchant !== undefined ? input.merchant : refundOf?.merchant ?? null,
        });
        const projectId = input.projectId ?? refundOf?.projectId?.toString() ?? null;
        await assertTransactionProject(workspace._id, projectId, refundOf?.projectId?.toString() ?? null);
        const receipt = receiptFields(workspace._id, input.receiptStorageKey);
        const asOf = new Date(`${input.date}T12:00:00.000Z`);
        const baseAmountMinor = await toBaseAmount({
          workspaceId: workspace._id,
          amountMinor: input.amountMinor,
          currency: input.currency,
          baseCurrency: workspace.baseCurrency,
          asOf,
        });
        const recurrence = input.recurrence
          ? {
              frequency: input.recurrence.frequency,
              interval: input.recurrence.interval,
              until: input.recurrence.until ? new Date(input.recurrence.until) : null,
            }
          : null;
        const doc = await TransactionModel.create({
          workspaceId: workspace._id,
          type: input.type,
          amountMinor: input.amountMinor,
          currency: input.currency,
          baseAmountMinor,
          categoryId: optionalOid(categoryId),
          accountId: optionalOid(accountId),
          ...transfer,
          refundOfId: refundOf?._id ?? null,
          clearing: input.clearing ?? "cleared",
          splits: storedSplits(lines, baseAmountMinor),
          ...labels,
          projectId: optionalOid(projectId),
          date: asOf,
          note: input.note ?? null,
          ...receipt,
          isRecurring: Boolean(recurrence),
          recurrence,
          createdById: oid(ctx.userId),
          isPosted: true,
        });
        if (doc.type === "expense") {
          const notifyLines = doc.splits.length ? doc.splits : [{ categoryId: doc.categoryId, baseAmountMinor }];
          for (const line of notifyLines) {
            await maybeNotifyBudgetThreshold({
              workspaceId: workspace._id.toString(),
              categoryId: line.categoryId?.toString() ?? null,
              addedExpenseMinor: line.baseAmountMinor,
            });
          }
        }
        return mapTransaction(doc);
      });
    },

    async updateTransaction(
      id: string,
      patch: UpdateTransactionInput,
    ): Promise<Transaction> {
      return withDb(async () => {
        const doc = await TransactionModel.findOne({ _id: oid(id), deletedAt: null });
        if (!doc) throw new ApiError(404, "not_found", "Transaction not found");
        const workspace = await requireWorkspace(ctx.userId, doc.workspaceId.toString());
        await requireTransactionEditor(ctx.userId, doc);
        // A pool expense is reviewed as submitted; changing it afterwards would
        // skip approval and leave the pool's total wrong.
        if (doc.budgetPoolId) {
          throw new ApiError(409, "pool_expense_locked", "Pool expenses can't be edited. Delete it and submit a new one.");
        }
        // A reconciled transaction matched a statement; it changes only after being marked cleared again.
        const clearing = clearingOf(doc.clearing);
        const locked = reconciledChange(clearing, {
          type: doc.type,
          amountMinor: doc.amountMinor,
          currency: doc.currency,
          date: isoDate(doc.date),
          accountId: doc.accountId?.toString() ?? null,
          toAccountId: doc.toAccountId?.toString() ?? null,
          toAmountMinor: doc.toAmountMinor ?? null,
        }, patch);
        if (locked) throw new ApiError(409, "reconciled", "This transaction is reconciled. Mark it cleared before changing it.");
        if (patch.clearing && patch.clearing !== clearing) {
          if (patch.clearing === "reconciled") {
            throw new ApiError(400, "invalid_request", "Transactions become reconciled when you reconcile their account");
          }
          // Undoing a reconciliation reopens a checked statement, so it takes the role that reconciles.
          if (clearing === "reconciled") await requireAction(ctx.userId, doc.workspaceId.toString(), "budget.manage");
          doc.clearing = patch.clearing;
        }
        // Refunds are made from their expense, so the link between them stays put.
        const changesType = Boolean(patch.type && patch.type !== doc.type);
        if (changesType && (doc.type === "refund" || patch.type === "refund")) {
          throw new ApiError(409, "refund_locked", doc.type === "refund" ? "A refund stays a refund. Delete it instead." : "Refund an expense from its row instead.");
        }
        if (doc.type === "refund" && patch.categoryId !== undefined && patch.categoryId !== (doc.categoryId?.toString() ?? null)) {
          throw new ApiError(400, "invalid_request", "A refund keeps its expense's category");
        }
        if (doc.type === "expense") {
          const refunded = (await refundedByExpense([doc._id])).get(String(doc._id)) ?? 0;
          if (refunded && (changesType || (patch.currency && patch.currency.toUpperCase() !== doc.currency))) {
            throw new ApiError(409, "has_refunds", "This expense has refunds. Delete them first.");
          }
          if (refunded && patch.amountMinor != null && patch.amountMinor < refunded) {
            throw new ApiError(400, "invalid_request", "The expense can't be less than what's been refunded");
          }
        }
        let refundOf: Awaited<ReturnType<typeof expenseToRefund>> | null = null;
        if (doc.type === "refund" && (patch.amountMinor != null || patch.currency)) {
          refundOf = await expenseToRefund(workspace._id, { refundOfId: doc.refundOfId?.toString(), amountMinor: patch.amountMinor ?? doc.amountMinor, currency: patch.currency ?? doc.currency }, doc._id);
        }
        if (doc.type === "refund" && patch.splits !== undefined) {
          throw new ApiError(400, "invalid_request", "A refund splits like its expense");
        }
        if (patch.categoryId !== undefined) await assertCategory(workspace._id, patch.categoryId);
        if (patch.type) doc.type = patch.type;
        if (patch.amountMinor != null) doc.amountMinor = patch.amountMinor;
        if (patch.currency) doc.currency = patch.currency;
        if (patch.categoryId !== undefined) doc.categoryId = optionalOid(patch.categoryId);
        if (patch.accountId !== undefined || (patch.currency && doc.accountId)) {
          const accountId = patch.accountId !== undefined ? patch.accountId : doc.accountId?.toString() ?? null;
          await assertTransactionAccount(workspace._id, accountId, patch.currency ?? doc.currency, doc.accountId?.toString() ?? null);
          doc.accountId = optionalOid(accountId);
        }
        if (doc.type === "transfer" || doc.toAccountId || patch.toAccountId) {
          const transfer = await resolveTransfer(workspace._id, {
            type: doc.type,
            accountId: doc.accountId?.toString() ?? null,
            currency: doc.currency,
            amountMinor: doc.amountMinor,
            // Changing a transfer to spending or income drops its "to" side.
            toAccountId: doc.type === "transfer" && patch.toAccountId === undefined ? doc.toAccountId?.toString() ?? null : patch.toAccountId ?? null,
            toAmountMinor: patch.toAmountMinor,
            previousToAmountMinor: doc.toAmountMinor,
          }, doc.toAccountId?.toString() ?? null);
          doc.toAccountId = transfer.toAccountId;
          doc.toAmountMinor = transfer.toAmountMinor;
        }
        if (patch.date) doc.date = new Date(`${patch.date}T12:00:00.000Z`);
        if (patch.note !== undefined) doc.note = patch.note;
        doc.set(labelFields({ tags: patch.tags, merchant: patch.merchant }));
        if (patch.projectId !== undefined) {
          await assertTransactionProject(workspace._id, patch.projectId, doc.projectId?.toString() ?? null);
          doc.projectId = optionalOid(patch.projectId);
        }
        if (patch.receiptStorageKey !== undefined) {
          const receipt = receiptFields(workspace._id, patch.receiptStorageKey);
          doc.receiptStorageKey = receipt.receiptStorageKey;
          doc.receiptUrl = receipt.receiptUrl;
        }
        if (patch.recurrence !== undefined) {
          doc.recurrence = patch.recurrence
            ? {
                frequency: patch.recurrence.frequency,
                interval: patch.recurrence.interval,
                until: patch.recurrence.until
                  ? new Date(patch.recurrence.until)
                  : null,
              }
            : null;
          doc.isRecurring = Boolean(patch.recurrence);
        }
        doc.baseAmountMinor = await toBaseAmount({
          workspaceId: workspace._id,
          amountMinor: doc.amountMinor,
          currency: doc.currency,
          baseCurrency: workspace.baseCurrency,
          asOf: doc.date,
        });
        // The split, as patched or as it was, must still add up; each line's base share follows the new base amount.
        let lines: Array<{ categoryId: Types.ObjectId | null; amountMinor: number; note?: string | null }> = doc.splits.map((line) => ({
          categoryId: line.categoryId ?? null,
          amountMinor: line.amountMinor,
          note: line.note ?? null,
        }));
        if (refundOf?.splits?.length) {
          lines = refundSplits(refundOf.splits as StoredSplit[], doc.amountMinor);
        } else if (patch.splits !== undefined) {
          lines = [];
          if (patch.splits?.length) {
            for (const line of patch.splits) await assertCategory(workspace._id, line.categoryId);
            lines = patch.splits.map((line) => ({ categoryId: optionalOid(line.categoryId), amountMinor: line.amountMinor, note: line.note ?? null }));
          }
        }
        if (lines.length && doc.type !== "refund") {
          if (patch.categoryId) throw new ApiError(400, "invalid_request", "Remove the split to give it one category");
          assertSplits(doc.type, doc.amountMinor, lines.map((line) => ({ categoryId: line.categoryId ? String(line.categoryId) : null, amountMinor: line.amountMinor })));
          doc.categoryId = null;
        }
        doc.set("splits", storedSplits(lines, doc.baseAmountMinor));
        await doc.save();
        return (await withRefunded([mapTransaction(doc)]))[0]!;
      });
    },

    async deleteTransaction(id: string): Promise<void> {
      return withDb(async () => {
        const doc = await TransactionModel.findOne({ _id: oid(id), deletedAt: null });
        if (!doc) throw new ApiError(404, "not_found", "Transaction not found");
        await requireTransactionEditor(ctx.userId, doc);
        if (clearingOf(doc.clearing) === "reconciled") {
          throw new ApiError(409, "reconciled", "This transaction is reconciled. Mark it cleared before deleting it.");
        }
        if (doc.type === "expense" && (await refundedByExpense([doc._id])).size) {
          throw new ApiError(409, "has_refunds", "This expense has refunds. Delete them first.");
        }
        if (doc.budgetPoolId && doc.approvalRequestId) {
          const approval = await ApprovalModel.findById(doc.approvalRequestId);
          if (approval?.status === "approved") {
            // Spent money leaves the pool total only by the owner's hand.
            await requireAction(ctx.userId, doc.workspaceId.toString(), "workspace.manage");
          }
        }
        // Claim the delete first, so two requests can't both adjust the pool.
        const claimed = await TransactionModel.findOneAndUpdate(
          { _id: doc._id, deletedAt: null },
          { $set: { deletedAt: new Date() } },
        );
        if (!claimed) throw new ApiError(404, "not_found", "Transaction not found");
        if (doc.budgetPoolId && doc.approvalRequestId) {
          const approval = await ApprovalModel.findById(doc.approvalRequestId);
          if (approval?.status === "approved") {
            await BudgetPoolModel.updateOne(
              { _id: doc.budgetPoolId },
              { $inc: { currentSpendMinor: -doc.baseAmountMinor } },
            );
          } else if (approval?.status === "submitted") {
            // Withdrawn before review: it leaves the approvers' inbox.
            await ApprovalModel.updateOne(
              { _id: approval._id, status: "submitted" },
              { $set: { status: "cancelled", reviewedAt: new Date() } },
            );
          }
        }
      });
    },

    async listBudgets(workspaceId: string): Promise<Budget[]> {
      return withDb(async () => {
        await requireMembership(ctx.userId, workspaceId);
        const docs = await BudgetModel.find({ workspaceId: oid(workspaceId) });
        return docs.map((doc) => mapBudget(doc));
      });
    },

    async upsertBudget(input: UpsertBudgetInput): Promise<Budget> {
      return withDb(async () => {
        const workspace = await requireWorkspace(ctx.userId, input.workspaceId);
        await requireAction(ctx.userId, input.workspaceId, "budget.manage");
        await assertCategory(workspace._id, input.categoryId);
        if (input.rollover && input.rollover !== "none" && !canRollOver(input.period)) {
          throw new ApiError(400, "invalid_request", "A custom budget covers one stretch of dates, so it can't roll over");
        }
        // Carrying counts from the day given, or from the start of this period when it's first turned on.
        const fiscalStart = workspace.fiscalYearStartMonth ?? defaultFiscalStart(workspace.baseCurrency);
        const existing = await BudgetModel.findOne({
          workspaceId: workspace._id,
          categoryId: oid(input.categoryId),
          period: input.period,
          periodStart: input.periodStart ? new Date(input.periodStart) : null,
        }).select("rollover rolloverSince limitAmountMinor").lean();
        if (input.renew && input.period !== "custom") {
          throw new ApiError(400, "invalid_request", "Weekly, monthly and yearly budgets already start again each period");
        }
        if (input.period === "custom" && (!input.periodStart || !input.periodEnd || input.periodEnd < input.periodStart)) {
          throw new ApiError(400, "invalid_request", "A custom budget needs a start and an end date, the end not before the start");
        }
        const rolloverFields: Record<string, unknown> = {};
        if (input.renew !== undefined) rolloverFields.renew = input.renew;
        if (input.rollover !== undefined) {
          rolloverFields.rollover = input.rollover;
          rolloverFields.rolloverSince =
            input.rollover === "none"
              ? null
              : input.rolloverSince
                ? new Date(`${input.rolloverSince}T00:00:00.000Z`)
                : existing?.rolloverSince ?? periodWindow(input.period, new Date(), undefined, fiscalStart).from;
        } else if (input.rolloverSince !== undefined && existing?.rollover && existing.rollover !== "none") {
          rolloverFields.rolloverSince = input.rolloverSince ? new Date(`${input.rolloverSince}T00:00:00.000Z`) : null;
        }
        const doc = await BudgetModel.findOneAndUpdate(
          {
            workspaceId: workspace._id,
            categoryId: oid(input.categoryId),
            period: input.period,
            periodStart: input.periodStart ? new Date(input.periodStart) : null,
          },
          {
            $set: {
              periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
              limitAmountMinor: input.limitAmountMinor,
              currency: (input.currency ?? workspace.baseCurrency).toUpperCase(),
              alertThresholdPct: input.alertThresholdPct ?? 80,
              ...rolloverFields,
            },
            $setOnInsert: {
              workspaceId: workspace._id,
              categoryId: oid(input.categoryId),
              period: input.period,
              periodStart: input.periodStart ? new Date(input.periodStart) : null,
            },
          },
          { upsert: true, returnDocument: "after" },
        );
        if (!doc) throw new ApiError(500, "internal_error", "Failed to save budget");
        // Each change to the limit is kept, so it can be looked back on (and restored).
        if (!existing || existing.limitAmountMinor !== doc.limitAmountMinor) {
          await recordRevision({
            budget: doc,
            previousLimitMinor: existing?.limitAmountMinor ?? null,
            limitMinor: doc.limitAmountMinor,
            reason: input.revisionReason ?? (existing ? "edited" : "created"),
            userId: ctx.userId,
          });
        }
        return mapBudget(doc);
      });
    },

    async deleteBudget(id: string): Promise<void> {
      return withDb(async () => {
        const doc = await BudgetModel.findById(id);
        if (!doc) throw new ApiError(404, "not_found", "Budget not found");
        await requireAction(ctx.userId, doc.workspaceId.toString(), "budget.manage");
        await doc.deleteOne();
        await recordRevision({ budget: doc, previousLimitMinor: doc.limitAmountMinor, limitMinor: null, reason: "deleted", userId: ctx.userId });
      });
    },

    async listBudgetPools(workspaceId: string): Promise<BudgetPool[]> {
      return withDb(async () => {
        await requireMembership(ctx.userId, workspaceId);
        const docs = await BudgetPoolModel.find({
          workspaceId: oid(workspaceId),
          archivedAt: null,
        }).sort({ name: 1 });
        return docs.map((doc) => mapBudgetPool(doc));
      });
    },

    async getBudgetPool(id: string): Promise<BudgetPool> {
      return withDb(async () => {
        const doc = await BudgetPoolModel.findById(id);
        if (!doc || doc.archivedAt) {
          throw new ApiError(404, "not_found", "Budget pool not found");
        }
        await requireMembership(ctx.userId, doc.workspaceId.toString());
        return mapBudgetPool(doc);
      });
    },

    async createBudgetPool(input: CreateBudgetPoolInput): Promise<BudgetPool> {
      return withDb(async () => {
        const workspace = await requireWorkspace(ctx.userId, input.workspaceId);
        await requireAction(ctx.userId, input.workspaceId, "pool.manage");
        const doc = await BudgetPoolModel.create({
          workspaceId: workspace._id,
          name: input.name.trim(),
          description: input.description ?? null,
          limitAmountMinor: input.limitAmountMinor,
          currency: (input.currency ?? workspace.baseCurrency).toUpperCase(),
          currentSpendMinor: 0,
          periodStart: input.periodStart ? new Date(input.periodStart) : null,
          periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
        });
        return mapBudgetPool(doc);
      });
    },

    async listSavingsGoals(workspaceId: string): Promise<SavingsGoal[]> {
      return withDb(async () => {
        await requireMembership(ctx.userId, workspaceId);
        const docs = await SavingsGoalModel.find({ workspaceId: oid(workspaceId) }).sort({
          createdAt: -1,
        });
        return docs.map((doc) => mapSavingsGoal(doc));
      });
    },

    async upsertSavingsGoal(input: UpsertSavingsGoalInput): Promise<SavingsGoal> {
      return withDb(async () => {
        const workspace = await requireWorkspace(ctx.userId, input.workspaceId);
        const current = input.currentAmountMinor ?? 0;
        const doc = await SavingsGoalModel.create({
          workspaceId: workspace._id,
          name: input.name.trim(),
          targetAmountMinor: input.targetAmountMinor,
          currentAmountMinor: current,
          currency: (input.currency ?? workspace.baseCurrency).toUpperCase(),
          targetDate: input.targetDate ? new Date(input.targetDate) : null,
          completedAt: current >= input.targetAmountMinor ? new Date() : null,
        });
        return mapSavingsGoal(doc);
      });
    },

    async contributeToGoal(id: string, amountMinor: number): Promise<SavingsGoal> {
      return withDb(async () => {
        const existing = await SavingsGoalModel.findById(oid(id)).select("workspaceId");
        if (!existing) throw new ApiError(404, "not_found", "Goal not found");
        await requireMembership(ctx.userId, existing.workspaceId.toString());
        // $inc in the database, so two contributions at once both count.
        const added = await SavingsGoalModel.findOneAndUpdate(
          { _id: existing._id },
          { $inc: { currentAmountMinor: amountMinor } },
          { returnDocument: "after" },
        );
        if (!added) throw new ApiError(404, "not_found", "Goal not found");
        // Only the contribution that crosses the target marks it complete.
        const completed = await SavingsGoalModel.findOneAndUpdate(
          {
            _id: existing._id,
            completedAt: null,
            $expr: { $gte: ["$currentAmountMinor", "$targetAmountMinor"] },
          },
          { $set: { completedAt: new Date() } },
          { returnDocument: "after" },
        );
        const doc = completed ?? added;
        if (completed) {
          await notifyUsers({
            userIds: [ctx.userId],
            workspaceId: doc.workspaceId.toString(),
            kind: "goal.reached",
            title: "Savings goal reached",
            body: `${doc.name} is complete.`,
            href: "/goals",
          });
        }
        return mapSavingsGoal(doc);
      });
    },

    async deleteSavingsGoal(id: string): Promise<void> {
      return withDb(async () => {
        const doc = await SavingsGoalModel.findById(id);
        if (!doc) throw new ApiError(404, "not_found", "Goal not found");
        await requireMembership(ctx.userId, doc.workspaceId.toString());
        await doc.deleteOne();
      });
    },

    async listApprovals(query: {
      workspaceId: string;
      status?: ApprovalStatus[];
    }): Promise<ApprovalView[]> {
      return withDb(async () => {
        const membership = await requireMembership(ctx.userId, query.workspaceId);
        const isDecider = can(membership.role as MemberRole, "expense.decide");
        const otherDecider = isDecider
          ? Boolean(await WorkspaceMember.exists({
              workspaceId: oid(query.workspaceId),
              userId: { $ne: oid(ctx.userId) },
              role: { $in: ["owner", "approver"] },
            }))
          : false;
        const filter: Record<string, unknown> = {
          workspaceId: oid(query.workspaceId),
        };
        if (query.status?.length) filter.status = { $in: query.status };
        const docs = await ApprovalModel.find(filter).sort({ createdAt: -1 }).limit(100);
        const txns = await TransactionModel.find({
          _id: { $in: docs.map((d) => d.transactionId) },
        });
        const users = await LedgerUser.find({
          _id: { $in: docs.map((d) => d.submittedById) },
        });
        const txnById = new Map(txns.map((t) => [t._id.toString(), t]));
        const userById = new Map(users.map((u) => [u._id.toString(), u]));
        return docs.flatMap((doc) => {
          const txn = txnById.get(doc.transactionId.toString());
          if (!txn) return [];
          const user = userById.get(doc.submittedById.toString());
          return [
            {
              ...mapApproval(doc),
              transaction: mapTransaction(txn),
              submitterName: user?.displayName ?? "Unknown",
              // Mirrors decideApproval's rule, so the inbox never offers a
              // button the server will refuse.
              canDecide: isDecider && (doc.submittedById.toString() !== ctx.userId || !otherDecider),
            },
          ];
        });
      });
    },

    async submitExpense(input: SubmitExpenseInput): Promise<{
      transaction: Transaction;
      approval: ApprovalRequest;
    }> {
      return withDb(async () => {
        const workspace = await requireWorkspace(ctx.userId, input.workspaceId);
        await requireAction(ctx.userId, input.workspaceId, "expense.submit");
        const pool = await BudgetPoolModel.findOne({
          _id: oid(input.budgetPoolId),
          workspaceId: workspace._id,
          archivedAt: null,
        });
        if (!pool) throw new ApiError(404, "not_found", "Budget pool not found");
        await assertCategory(workspace._id, input.categoryId);
        const receipt = receiptFields(workspace._id, input.receiptStorageKey);
        const asOf = new Date(`${input.date}T12:00:00.000Z`);
        const baseAmountMinor = await toBaseAmount({
          workspaceId: workspace._id,
          amountMinor: input.amountMinor,
          currency: input.currency,
          baseCurrency: workspace.baseCurrency,
          asOf,
        });
        const txn = await TransactionModel.create({
          workspaceId: workspace._id,
          type: "expense",
          amountMinor: input.amountMinor,
          currency: input.currency,
          baseAmountMinor,
          categoryId: optionalOid(input.categoryId),
          budgetPoolId: pool._id,
          date: asOf,
          note: input.note ?? null,
          ...receipt,
          createdById: oid(ctx.userId),
          isPosted: false,
        });
        const approval = await ApprovalModel.create({
          workspaceId: workspace._id,
          transactionId: txn._id,
          budgetPoolId: pool._id,
          submittedById: oid(ctx.userId),
          status: "submitted",
          submittedAt: new Date(),
        });
        txn.approvalRequestId = approval._id;
        await txn.save();

        const approvers = await WorkspaceMember.find({
          workspaceId: workspace._id,
          role: { $in: ["owner", "approver"] },
        });
        await notifyUsers({
          userIds: approvers
            .map((m) => m.userId.toString())
            .filter((id) => id !== ctx.userId),
          workspaceId: workspace._id.toString(),
          kind: "approval.requested",
          title: "Expense submitted",
          body: `An expense needs review in ${pool.name}`,
          href: `/w/${workspace._id.toString()}/approvals`,
        });

        const payload = {
          approval: mapApproval(approval),
          transaction: mapTransaction(txn),
          poolId: pool._id.toString(),
          version: Date.parse(approval.updatedAt.toISOString()),
        };
        await publishMany([
          {
            channel: `workspace:${workspace._id.toString()}:budgetpool:${pool._id.toString()}`,
            event: "expense.submitted",
            data: payload,
          },
          {
            channel: `workspace:${workspace._id.toString()}:approvals`,
            event: "expense.submitted",
            data: payload,
          },
        ]);

        return { transaction: mapTransaction(txn), approval: mapApproval(approval) };
      });
    },

    async decideApproval(input: DecideApprovalInput): Promise<{
      approval: ApprovalRequest;
      transaction: Transaction;
      pool: BudgetPool;
    }> {
      return withDb(async () => {
        const existing = await ApprovalModel.findById(input.approvalId);
        if (!existing) throw new ApiError(404, "not_found", "Approval not found");
        await requireAction(ctx.userId, existing.workspaceId.toString(), "expense.decide");

        // Nobody reviews their own expense, unless nobody else in the
        // workspace can (a team of one).
        if (existing.submittedById.toString() === ctx.userId) {
          const otherDecider = await WorkspaceMember.exists({
            workspaceId: existing.workspaceId,
            userId: { $ne: oid(ctx.userId) },
            role: { $in: ["owner", "approver"] },
          });
          if (otherDecider) {
            throw new ApiError(403, "forbidden", "Someone else has to review your own expense");
          }
        }

        const pending = await TransactionModel.exists({ _id: existing.transactionId, deletedAt: null });
        if (!pending) {
          await ApprovalModel.updateOne(
            { _id: existing._id, status: "submitted" },
            { $set: { status: "cancelled", reviewedAt: new Date() } },
          );
          throw new ApiError(409, "conflict", "This expense was withdrawn");
        }

        const approval = await ApprovalModel.findOneAndUpdate(
          { _id: existing._id, status: "submitted" },
          {
            $set: {
              status: input.decision,
              reviewedById: oid(ctx.userId),
              reviewNote: input.reviewNote ?? null,
              reviewedAt: new Date(),
            },
          },
          { returnDocument: "after" },
        );
        if (!approval) {
          throw new ApiError(409, "conflict", "This expense was already decided");
        }

        const txn = await TransactionModel.findOne({ _id: approval.transactionId, deletedAt: null });
        if (!txn) {
          // Withdrawn in the moment between the check above and this decision.
          await ApprovalModel.updateOne({ _id: approval._id }, { $set: { status: "cancelled" } });
          throw new ApiError(409, "conflict", "This expense was withdrawn");
        }
        const pool = await BudgetPoolModel.findById(approval.budgetPoolId);
        if (!pool) throw new ApiError(404, "not_found", "Budget pool not found");

        if (input.decision === "approved") {
          txn.isPosted = true;
          await txn.save();
          await BudgetPoolModel.updateOne(
            { _id: pool._id },
            { $inc: { currentSpendMinor: txn.baseAmountMinor } },
          );
          const fresh = await BudgetPoolModel.findById(pool._id);
          if (fresh) {
            pool.currentSpendMinor = fresh.currentSpendMinor;
            pool.updatedAt = fresh.updatedAt;
          }
          await maybeNotifyBudgetThreshold({
            workspaceId: approval.workspaceId.toString(),
            categoryId: txn.categoryId ? txn.categoryId.toString() : null,
            addedExpenseMinor: txn.baseAmountMinor,
          });
        }

        await notifyUsers({
          userIds: [approval.submittedById.toString()],
          workspaceId: approval.workspaceId.toString(),
          kind: "approval.decided",
          title: input.decision === "approved" ? "Expense approved" : "Expense rejected",
          body: input.reviewNote || `Your expense was ${input.decision}`,
          href: `/w/${approval.workspaceId.toString()}/expenses`,
        });

        const mappedPool = mapBudgetPool(pool);
        const payload = {
          approval: mapApproval(approval),
          transaction: mapTransaction(txn),
          pool: mappedPool,
          poolId: pool._id.toString(),
          version: Date.parse(approval.updatedAt.toISOString()),
        };
        const event =
          input.decision === "approved" ? "expense.approved" : "expense.rejected";
        const wsId = approval.workspaceId.toString();
        await publishMany([
          {
            channel: `workspace:${wsId}:budgetpool:${pool._id.toString()}`,
            event,
            data: payload,
          },
          {
            channel: `workspace:${wsId}:approvals`,
            event,
            data: payload,
          },
          {
            channel: `workspace:${wsId}:budgetpool:${pool._id.toString()}`,
            event: "budget.updated",
            data: { pool: mappedPool, version: Date.parse(pool.updatedAt.toISOString()) },
          },
        ]);

        return {
          approval: mapApproval(approval),
          transaction: mapTransaction(txn),
          pool: mappedPool,
        };
      });
    },

    async listMembers(workspaceId: string): Promise<MemberView[]> {
      return withDb(async () => {
        await requireMembership(ctx.userId, workspaceId);
        return listMembers(workspaceId);
      });
    },

    async listNotifications(): Promise<InAppNotification[]> {
      return withDb(async () => {
        const docs = await NotificationModel.find({ userId: oid(ctx.userId) })
          .sort({ createdAt: -1 })
          .limit(30);
        return docs.map((doc) => mapNotification(doc));
      });
    },

    async markNotificationRead(id: string): Promise<void> {
      return withDb(async () => {
        await NotificationModel.updateOne(
          { _id: oid(id), userId: oid(ctx.userId) },
          { $set: { readAt: new Date() } },
        );
      });
    },

    async listFxRates(workspaceId: string): Promise<FxRate[]> {
      return withDb(async () => {
        await requireMembership(ctx.userId, workspaceId);
        const docs = await FxRateModel.find({ workspaceId: oid(workspaceId) }).sort({
          currency: 1,
          effectiveFrom: -1,
        });
        return docs.map((doc) => mapFxRate(doc));
      });
    },

    async upsertFxRate(input: UpsertFxRateInput): Promise<FxRate> {
      return withDb(async () => {
        // Rates change every member's converted totals.
        await requireAction(ctx.userId, input.workspaceId, "fx.manage");
        const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
        const doc = await FxRateModel.findOneAndUpdate(
          {
            workspaceId: oid(input.workspaceId),
            currency: input.currency,
            effectiveFrom,
          },
          {
            $set: {
              rateToBaseScaled: input.rateToBaseScaled,
              createdById: oid(ctx.userId),
            },
            $setOnInsert: {
              workspaceId: oid(input.workspaceId),
              currency: input.currency,
              effectiveFrom,
            },
          },
          { upsert: true, returnDocument: "after" },
        );
        if (!doc) throw new ApiError(500, "internal_error", "Failed to save FX rate");
        return mapFxRate(doc);
      });
    },

    async getDashboardSummary(
      workspaceId: string,
      preset: DateRangePreset,
    ): Promise<DashboardSummary> {
      return withDb(async () => {
        const workspace = await requireWorkspace(ctx.userId, workspaceId);
        const range = dashboardRange(preset, new Date(), workspace.fiscalYearStartMonth ?? defaultFiscalStart(workspace.baseCurrency));
        const [txns, categories, budgets] = await Promise.all([
          TransactionModel.find({
            workspaceId: workspace._id,
            deletedAt: null,
            isPosted: true,
            date: { $gte: range.from, $lte: range.to },
          }),
          CategoryModel.find({ workspaceId: workspace._id, deletedAt: null }),
          BudgetModel.find({ workspaceId: workspace._id }),
        ]);

        const categoryById = new Map(categories.map((c) => [c._id.toString(), c]));
        const categoryNodes = categories.map((c) => ({ id: c._id.toString(), name: c.name, parentId: c.parentId?.toString() ?? null }));
        let incomeMinor = 0;
        let expenseMinor = 0;
        const byCategoryMap = new Map<
          string,
          { categoryId: string | null; name: string; color: string; amountMinor: number }
        >();
        const overTimeMap = new Map<string, { expenseMinor: number; incomeMinor: number }>();

        for (const txn of txns) {
          const day = isoDate(txn.date);
          const bucket = overTimeMap.get(day) ?? { expenseMinor: 0, incomeMinor: 0 };
          if (txn.type === "income") {
            incomeMinor += txn.baseAmountMinor;
            bucket.incomeMinor += txn.baseAmountMinor;
          } else if (spendSign(txn.type)) {
            // Refunds take back from spending (and from the expense's category).
            const spent = spendSign(txn.type) * txn.baseAmountMinor;
            expenseMinor += spent;
            bucket.expenseMinor += spent;
            // A split counts each line in its own category.
            const lines = txn.splits?.length ? txn.splits : [{ categoryId: txn.categoryId, baseAmountMinor: txn.baseAmountMinor }];
            for (const line of lines) {
              // Subcategories roll up into their top-level category here.
              const topId = line.categoryId ? topLevelOf(line.categoryId.toString(), categoryNodes) : null;
              const key = topId ?? "uncategorized";
              const category = topId ? categoryById.get(topId) : null;
              const current = byCategoryMap.get(key) ?? {
                categoryId: topId,
                name: category?.name ?? "Uncategorized",
                color: category?.color ?? "#737373",
                amountMinor: 0,
              };
              current.amountMinor += spendSign(txn.type) * line.baseAmountMinor;
              byCategoryMap.set(key, current);
            }
          }
          overTimeMap.set(day, bucket);
        }

        const budgetRows = await Promise.all(
          budgets.map(async (budget) => {
            const status = await budgetStatus(budget, workspace.fiscalYearStartMonth ?? defaultFiscalStart(workspace.baseCurrency));
            return {
              budget: mapBudget(budget),
              spentMinor: status.spentMinor,
              remainingMinor: status.remainingMinor,
              carriedInMinor: status.carriedInMinor,
              availableMinor: status.availableMinor,
              periodFrom: isoDate(status.window.from),
              periodTo: isoDate(status.window.to),
            };
          }),
        );

        return {
          baseCurrency: workspace.baseCurrency,
          range: { from: isoDate(range.from), to: isoDate(range.to) },
          incomeMinor,
          expenseMinor,
          netMinor: incomeMinor - expenseMinor,
          byCategory: [...byCategoryMap.values()].sort(
            (a, b) => b.amountMinor - a.amountMinor,
          ),
          overTime: [...overTimeMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, value]) => ({ date, ...value })),
          budgets: budgetRows,
        };
      });
    },
  };
}
