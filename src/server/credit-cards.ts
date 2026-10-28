import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account as AccountModel } from "@/src/server/models";
import type { AccountDocument } from "@/src/server/models/Account";
import { requireAction, requireMembershipRole } from "@/src/server/workspace/members";
import { entriesByAccount } from "@/src/server/net-worth";
import { balancesOn } from "@/src/core/net-worth";
import { cardBill, cardCycle, type CardTerms, type CardView } from "@/src/core/credit-cards";

function oid(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(400, "invalid_request", "Invalid id");
  return new Types.ObjectId(id);
}

function termsOf(account: Pick<AccountDocument, "cardTerms">): CardTerms | null {
  const t = account.cardTerms;
  if (!t?.statementDay) return null;
  return { statementDay: t.statementDay, dueDays: t.dueDays, creditLimitMinor: t.creditLimitMinor ?? null, minimumPct: t.minimumPct };
}

/**
 * Each open card in the workspace with its terms and, once its statement day
 * is known, its bill: the last statement's balance, what's left to pay on
 * it, the minimum, the due date and how much of the limit is in use.
 */
export async function cardBills(workspaceId: Types.ObjectId, today: string): Promise<CardView[]> {
  const cards = await AccountModel.find({ workspaceId, archivedAt: null, kind: "credit_card" }).sort({ createdAt: 1 }).lean<AccountDocument[]>();
  if (!cards.length) return [];
  const entries = await entriesByAccount(cards.map((c) => c._id));
  return cards.map((card) => {
    const terms = termsOf(card);
    const own = entries.get(String(card._id)) ?? [];
    const account = { kind: "credit_card" as const, openingMinor: card.openingBalanceMinor, openingDate: card.openingDate.toISOString().slice(0, 10) };
    // Before the card's opening date there's no balance yet: nothing owed.
    const balanceNowMinor = balancesOn(account, own, [today])[0] ?? 0;
    const base = { accountId: String(card._id), name: card.name, currency: card.currency, terms, balanceNowMinor };
    if (!terms) return { ...base, bill: null };
    const { lastStatement } = cardCycle(today, terms.statementDay);
    const statementBalanceMinor = balancesOn(account, own, [lastStatement])[0] ?? 0;
    // Money into the card after the statement pays it down: payments, refunds and cashback.
    const paidSinceMinor = own
      .filter((e) => e.date > lastStatement && e.date <= today && (e.type === "transfer_in" || e.type === "income" || e.type === "refund"))
      .reduce((sum, e) => sum + e.amountMinor, 0);
    return { ...base, bill: cardBill(terms, { statementBalanceMinor, paidSinceMinor, balanceNowMinor }, today) };
  });
}

export function listCards(userId: string, workspaceId: string): Promise<{ cards: CardView[] }> {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    return { cards: await cardBills(oid(workspaceId), new Date().toISOString().slice(0, 10)) };
  });
}

/** Sets a card's statement day, days to pay, limit and minimum share; null clears them. */
export function setCardTerms(userId: string, accountId: string, terms: CardTerms | null) {
  return withDb(async () => {
    const card = await AccountModel.findById(oid(accountId));
    if (!card) throw new ApiError(404, "not_found", "Account not found");
    await requireAction(userId, String(card.workspaceId), "budget.manage");
    if (card.kind !== "credit_card") throw new ApiError(400, "invalid_request", "Statement dates are for credit cards");
    card.set("cardTerms", terms);
    await card.save();
    return { terms: termsOf(card) };
  });
}
