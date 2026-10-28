import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel, DebtSettings, LoanPlan, Workspace } from "@/src/server/models";
import type { LoanPlanDocument } from "@/src/server/models/LoanPlan";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { baseConverter, entriesByAccount } from "@/src/server/net-worth";
import { balancesOn } from "@/src/core/net-worth";
import { loanSchedule } from "@/src/core/loans";
import { DEFAULT_CARD_RATE_PCT, defaultCardMinimum, type DebtStrategy, type DebtView } from "@/src/core/debts";
import type { AccountKind } from "@/src/core/accounts";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

/**
 * What the workspace owes: each loan and card account with a balance, in the
 * base currency, with its rate and minimum. A loan with a repayment schedule
 * brings its own rate and EMI; a card gets the usual rate and minimum due
 * until the real ones are typed in; anything typed in wins.
 */
export function listDebts(userId: string, workspaceId: string): Promise<{ baseCurrency: string; debts: DebtView[]; strategy: DebtStrategy; extraMonthlyMinor: number; missingRates: string[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const ws = oid(workspaceId);
    const workspace = await Workspace.findById(ws).select("baseCurrency").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    const today = new Date().toISOString().slice(0, 10);
    const accounts = await AccountModel.find({ workspaceId: ws, archivedAt: null, kind: { $in: ["loan", "credit_card"] } }).lean();
    const [entries, toBase, plans, settings] = await Promise.all([
      entriesByAccount(accounts.map((a) => a._id)),
      baseConverter(ws, workspace.baseCurrency),
      LoanPlan.find({ workspaceId: ws }).lean<LoanPlanDocument[]>(),
      DebtSettings.findOne({ workspaceId: ws }).lean(),
    ]);
    const planFor = new Map(plans.map((p) => [String(p.loanAccountId), p]));
    const overrides = new Map((settings?.overrides ?? []).map((o) => [String(o.accountId), o]));
    const missing = new Set<string>();
    const debts: DebtView[] = [];
    for (const account of accounts) {
      const kind = account.kind as AccountKind;
      const owed =
        balancesOn({ kind, openingMinor: account.openingBalanceMinor, openingDate: account.openingDate.toISOString().slice(0, 10) }, entries.get(String(account._id)) ?? [], [today])[0] ?? 0;
      if (owed <= 0) continue;
      const plan = planFor.get(String(account._id));
      const override = overrides.get(String(account._id));
      const ownRate = plan ? plan.annualRatePct : kind === "credit_card" ? DEFAULT_CARD_RATE_PCT : null;
      const ownMinimum = plan ? (loanSchedule(plan)[0]?.amountMinor ?? 0) : kind === "credit_card" ? defaultCardMinimum(owed, account.currency, account.cardTerms?.minimumPct ?? undefined) : null;
      const rate = override?.annualRatePct ?? ownRate;
      const minimum = override?.minimumMinor ?? ownMinimum;
      const balance = toBase(owed, account.currency, today);
      const minimumBase = minimum == null ? null : toBase(minimum, account.currency, today);
      if (balance == null || (minimum != null && minimumBase == null)) {
        missing.add(account.currency);
        continue;
      }
      debts.push({
        id: String(account._id),
        name: account.name,
        kind: kind === "loan" ? "loan" : "card",
        currency: account.currency,
        balanceMinor: balance,
        annualRatePct: rate ?? 0,
        minimumMinor: minimumBase ?? 0,
        fromSchedule: Boolean(plan) && !override,
        // A loan without a schedule needs its rate and EMI before a plan can count on it.
        needsTerms: rate == null || minimum == null,
      });
    }
    return {
      baseCurrency: workspace.baseCurrency,
      debts: debts.sort((a, b) => b.balanceMinor - a.balanceMinor),
      strategy: (settings?.strategy ?? "avalanche") as DebtStrategy,
      extraMonthlyMinor: settings?.extraMonthlyMinor ?? 0,
      missingRates: [...missing].sort(),
    };
  });
}

/** Saves the plan chosen, the extra a month, and a debt's rate or minimum (in its own currency). */
export function saveDebtSettings(
  userId: string,
  workspaceId: string,
  input: { strategy?: DebtStrategy; extraMonthlyMinor?: number; debt?: { accountId: string; annualRatePct?: number | null; minimumMinor?: number | null } },
) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "expense.submit");
    const ws = oid(workspaceId);
    const doc = (await DebtSettings.findOne({ workspaceId: ws })) ?? new DebtSettings({ workspaceId: ws });
    if (input.strategy) doc.strategy = input.strategy;
    if (input.extraMonthlyMinor !== undefined) doc.extraMonthlyMinor = input.extraMonthlyMinor;
    if (input.debt) {
      const account = await AccountModel.findOne({ _id: oid(input.debt.accountId), workspaceId: ws, kind: { $in: ["loan", "credit_card"] } }).select("_id").lean();
      if (!account) throw new ApiError(400, "invalid_request", "That isn't a loan or card in this workspace");
      const others = (doc.overrides ?? []).filter((o) => String(o.accountId) !== input.debt!.accountId);
      const current = (doc.overrides ?? []).find((o) => String(o.accountId) === input.debt!.accountId);
      const next = {
        accountId: account._id,
        annualRatePct: input.debt.annualRatePct !== undefined ? input.debt.annualRatePct : (current?.annualRatePct ?? null),
        minimumMinor: input.debt.minimumMinor !== undefined ? input.debt.minimumMinor : (current?.minimumMinor ?? null),
      };
      doc.set("overrides", next.annualRatePct == null && next.minimumMinor == null ? others : [...others, next]);
    }
    await doc.save();
  });
}
