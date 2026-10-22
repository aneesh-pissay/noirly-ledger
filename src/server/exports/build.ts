import { Types } from "mongoose";
import { isoDate } from "@/src/core/budgets/period";
import { withDb } from "@/src/server/db/mongodb";
import {
  ApprovalRequest,
  BudgetPool,
  Category,
  LedgerUser,
  Transaction,
} from "@/src/server/models";
import {
  CSV_HEADER,
  transactionToCsvRow,
  type CsvTransactionRow,
} from "@/src/server/exports/csv";
import { renderSummaryPdf, type PdfSummary } from "@/src/server/exports/pdf";
import { spendSign } from "@/src/core/refunds";
import { PATH_SEPARATOR } from "@/src/core/categories";
import type { TransactionType } from "@/src/core/models/enums";

export type ExportQuery = {
  workspaceId: string;
  from: string;
  to: string;
  budgetPoolId?: string | null;
  template: "summary" | "pool" | "approvals";
};

function oid(id: string) {
  return new Types.ObjectId(id);
}

async function loadRows(query: ExportQuery): Promise<CsvTransactionRow[]> {
  const filter: Record<string, unknown> = {
    workspaceId: oid(query.workspaceId),
    deletedAt: null,
    date: {
      $gte: new Date(`${query.from}T00:00:00.000Z`),
      $lte: new Date(`${query.to}T23:59:59.999Z`),
    },
  };
  if (query.budgetPoolId) filter.budgetPoolId = oid(query.budgetPoolId);
  if (query.template === "approvals") filter.approvalRequestId = { $ne: null };

  const txns = await Transaction.find(filter).sort({ date: 1 }).limit(10_000);
  const categories = await Category.find({
    _id: {
      $in: txns.map((t) => t.categoryId).filter((id): id is Types.ObjectId => Boolean(id)),
    },
  });
  const pools = await BudgetPool.find({
    _id: {
      $in: txns
        .map((t) => t.budgetPoolId)
        .filter((id): id is Types.ObjectId => Boolean(id)),
    },
  });
  const users = await LedgerUser.find({
    _id: { $in: txns.map((t) => t.createdById) },
  });
  // Subcategories export as "Parent › Child".
  const parents = await Category.find({ _id: { $in: categories.map((c) => c.parentId).filter((id): id is Types.ObjectId => Boolean(id)) } }).select("name").lean();
  const parentName = new Map(parents.map((p) => [p._id.toString(), p.name]));
  const catById = new Map(
    categories.map((c) => {
      const parent = c.parentId ? parentName.get(c.parentId.toString()) : undefined;
      return [c._id.toString(), parent ? `${parent}${PATH_SEPARATOR}${c.name}` : c.name];
    }),
  );
  const poolById = new Map(pools.map((p) => [p._id.toString(), p.name]));
  const userById = new Map(users.map((u) => [u._id.toString(), u.displayName]));

  return txns.map((txn) => ({
    date: isoDate(txn.date),
    type: txn.type,
    amountMinor: txn.amountMinor,
    currency: txn.currency,
    baseAmountMinor: txn.baseAmountMinor,
    category: txn.categoryId ? catById.get(txn.categoryId.toString()) ?? "" : "",
    pool: txn.budgetPoolId ? poolById.get(txn.budgetPoolId.toString()) ?? "" : "",
    note: txn.note ?? "",
    status: txn.isPosted ? "posted" : "pending",
    createdBy: userById.get(txn.createdById.toString()) ?? "",
  }));
}

export async function buildCsvExport(query: ExportQuery): Promise<string> {
  return withDb(async () => {
    const rows = await loadRows(query);
    return [CSV_HEADER, ...rows.map(transactionToCsvRow)].join("\n") + "\n";
  });
}

export async function buildPdfExport(
  query: ExportQuery,
  workspaceName: string,
  baseCurrency: string,
): Promise<Buffer> {
  return withDb(async () => {
    const rows = await loadRows(query);
    let title = `${workspaceName} summary`;
    if (query.template === "pool") title = `${workspaceName} pool report`;
    if (query.template === "approvals") title = `${workspaceName} approval audit`;

    const incomeMinor = rows
      .filter((r) => r.type === "income")
      .reduce((sum, r) => sum + r.baseAmountMinor, 0);
    // Spending is net of refunds.
    const expenseMinor = rows.reduce((sum, r) => sum + spendSign(r.type as TransactionType) * r.baseAmountMinor, 0);

    const byLabel = new Map<string, number>();
    for (const row of rows) {
      if (!spendSign(row.type as TransactionType)) continue;
      const label =
        query.template === "pool"
          ? row.pool || "Pool"
          : query.template === "approvals"
            ? row.status
            : row.category || "Uncategorized";
      byLabel.set(label, (byLabel.get(label) ?? 0) + spendSign(row.type as TransactionType) * row.baseAmountMinor);
    }

    if (query.template === "pool" && query.budgetPoolId) {
      const pool = await BudgetPool.findById(query.budgetPoolId);
      if (pool) {
        byLabel.set("Pool limit", pool.limitAmountMinor);
        byLabel.set("Current spend", pool.currentSpendMinor);
      }
    }

    if (query.template === "approvals") {
      const approvals = await ApprovalRequest.find({
        workspaceId: oid(query.workspaceId),
        createdAt: {
          $gte: new Date(`${query.from}T00:00:00.000Z`),
          $lte: new Date(`${query.to}T23:59:59.999Z`),
        },
      });
      const counts = new Map<string, number>();
      for (const item of approvals) {
        counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
      }
      for (const [status, count] of counts) {
        byLabel.set(`${status} count`, count);
      }
    }

    const summary: PdfSummary = {
      title,
      subtitle: workspaceName,
      rangeLabel: `${query.from} → ${query.to}`,
      baseCurrency,
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
      rows: [...byLabel.entries()].map(([label, amountMinor]) => ({
        label,
        amountMinor,
      })),
    };
    return renderSummaryPdf(summary);
  });
}
