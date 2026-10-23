import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Budget as BudgetModel, BudgetPlan, BudgetTemplate, Category as CategoryModel } from "@/src/server/models";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { BUILT_IN_TEMPLATES, needsIncome, templateLimits, type TemplateLine } from "@/src/core/budgets/templates";
import { formatMinorToMajor } from "@/src/core/money";
import type { BudgetPeriod } from "@/src/core/models/enums";
import type { RolloverMode } from "@/src/core/budgets/rollover";
import type { BudgetTemplateSummary, UpsertBudgetInput, Budget } from "@/src/core/sync/types";

const MAX_TEMPLATES = 20;

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function describe(lines: TemplateLine[]) {
  return `${lines.length} budget${lines.length === 1 ? "" : "s"}: ${lines.map((line) => line.categoryName).join(", ")}`;
}

/** Built-in templates, then the workspace's saved ones. */
export function listBudgetTemplates(userId: string, workspaceId: string): Promise<BudgetTemplateSummary[]> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const saved = await BudgetTemplate.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: -1 }).lean();
    return [
      ...BUILT_IN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, builtIn: true, needsIncome: needsIncome(t.lines), lineCount: t.lines.length })),
      ...saved.map((t) => {
        const lines = t.lines as TemplateLine[];
        return { id: String(t._id), name: t.name, description: describe(lines), builtIn: false, needsIncome: false, lineCount: lines.length };
      }),
    ];
  });
}

/** Saves the workspace's repeating budgets (not one-off date ranges) as a template. */
export function saveBudgetTemplate(userId: string, workspaceId: string, name: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    if ((await BudgetTemplate.countDocuments({ workspaceId: ws })) >= MAX_TEMPLATES) {
      throw new ApiError(400, "limit_reached", `A workspace can keep up to ${MAX_TEMPLATES} templates.`);
    }
    const budgets = await BudgetModel.find({ workspaceId: ws, period: { $ne: "custom" } }).lean();
    const categories = await CategoryModel.find({ _id: { $in: budgets.map((b) => b.categoryId) }, deletedAt: null }).select("name").lean();
    const nameOf = new Map(categories.map((c) => [String(c._id), c.name]));
    const lines = budgets
      .filter((b) => nameOf.has(String(b.categoryId)))
      .map((b) => ({ categoryName: nameOf.get(String(b.categoryId))!, period: b.period, limitMinor: b.limitAmountMinor, rollover: b.rollover ?? "none" }));
    if (!lines.length) throw new ApiError(400, "invalid_request", "Add some weekly, monthly or yearly budgets first, then save them as a template");
    const doc = await BudgetTemplate.create({ workspaceId: ws, name: name.trim(), lines, createdById: oid(userId) });
    return { id: String(doc._id), name: doc.name, description: describe(lines as TemplateLine[]), builtIn: false, needsIncome: false, lineCount: lines.length };
  });
}

export function deleteBudgetTemplate(userId: string, templateId: string) {
  return withDb(async () => {
    const doc = await BudgetTemplate.findById(oid(templateId));
    if (!doc) throw new ApiError(404, "not_found", "Template not found");
    await requireAction(userId, String(doc.workspaceId), "budget.manage");
    await doc.deleteOne();
  });
}

/**
 * Creates (or updates) each of a template's budgets, finding its category by
 * name among the top-level categories and making it if there isn't one.
 * `upsert` is the signed-in person's budget save, so the usual checks apply.
 */
export function applyBudgetTemplate(
  userId: string,
  workspaceId: string,
  templateId: string,
  monthlyIncomeMinor: number | null,
  upsert: (input: UpsertBudgetInput) => Promise<Budget>,
) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "budget.manage");
    const ws = oid(workspaceId);
    let lines: TemplateLine[];
    const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === templateId);
    if (builtIn) {
      lines = builtIn.lines;
    } else {
      const saved = await BudgetTemplate.findOne({ _id: oid(templateId), workspaceId: ws }).lean();
      if (!saved) throw new ApiError(404, "not_found", "Template not found");
      lines = saved.lines as TemplateLine[];
    }
    let limits: number[];
    try {
      limits = templateLimits(lines, monthlyIncomeMinor);
    } catch (error) {
      throw new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Invalid income");
    }
    const categories = await CategoryModel.find({ workspaceId: ws, deletedAt: null, archivedAt: null, parentId: null }).select("name").lean();
    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), String(c._id)]));
    let created = 0;
    for (const [i, line] of lines.entries()) {
      let categoryId = byName.get(line.categoryName.toLowerCase());
      if (!categoryId) {
        const doc = await CategoryModel.create({ workspaceId: ws, name: line.categoryName, icon: "circle", color: "#C9A227", isSystem: false });
        categoryId = String(doc._id);
        byName.set(line.categoryName.toLowerCase(), categoryId);
        created += 1;
      }
      if (!limits[i]) continue;
      await upsert({
        workspaceId,
        categoryId,
        period: line.period as BudgetPeriod,
        limitAmountMinor: limits[i]!,
        rollover: (line.rollover ?? "none") as RolloverMode,
        revisionReason: "template",
      });
    }
    // The income it was shared out from becomes this month's plan, unless the month already has one.
    if (monthlyIncomeMinor != null && needsIncome(lines)) {
      const month = new Date().toISOString().slice(0, 7);
      await BudgetPlan.updateOne(
        { workspaceId: ws, month, expectedIncomeMinor: { $in: [null] } },
        { $set: { expectedIncomeMinor: monthlyIncomeMinor }, $setOnInsert: { workspaceId: ws, month } },
        { upsert: true },
      ).catch(() => undefined);
    }
    return { budgets: lines.filter((_, i) => limits[i]).length, categoriesCreated: created, limits: limits.map((minor) => formatMinorToMajor(minor)) };
  });
}
