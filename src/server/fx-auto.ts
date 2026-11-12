import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Account, FxRate, Transaction, Workspace } from "@/src/server/models";
import { requireAction } from "@/src/server/workspace/members";
import { isoDate } from "@/src/core/budgets/period";
import { fixedReply, parseProviderReply, providerCovers, toStoredRates, type ProviderRates } from "@/src/core/fx-provider";

/**
 * Fetching exchange rates (src/core/fx-provider.ts). FX_RATES_URL is the
 * provider (Frankfurter's API by default; "fixed" uses set rates and never
 * goes online, for tests).
 */
const DEFAULT_PROVIDER = "https://api.frankfurter.dev/v1";

export async function fetchRates(base: string, symbols: readonly string[], date: string | null): Promise<ProviderRates> {
  const url = process.env.FX_RATES_URL || DEFAULT_PROVIDER;
  if (url === "fixed") return fixedReply(base, symbols, date ?? isoDate(new Date()));
  const query = new URLSearchParams({ base, symbols: symbols.join(",") });
  const response = await fetch(`${url.replace(/\/$/, "")}/${date ?? "latest"}?${query}`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`The rates provider said ${response.status}`);
  return parseProviderReply(await response.json());
}

/** Keeps fetched rates, except where someone set that day's rate by hand. How many were kept. */
async function storeRates(workspace: { _id: Types.ObjectId; ownerUserId: Types.ObjectId; baseCurrency: string }, reply: ProviderRates) {
  const { date, scaled } = toStoredRates(reply, workspace.baseCurrency);
  const effectiveFrom = new Date(`${date}T00:00:00.000Z`);
  let kept = 0;
  for (const [currency, rateToBaseScaled] of scaled) {
    const res = await FxRate.updateOne(
      // Only a fetched rate is replaced; rates saved before fetching existed have no source and count as hand-set.
      { workspaceId: workspace._id, currency, effectiveFrom, source: "auto" },
      { $set: { rateToBaseScaled, source: "auto" }, $setOnInsert: { workspaceId: workspace._id, currency, effectiveFrom, createdById: workspace.ownerUserId } },
      { upsert: true },
    ).catch((error: { code?: number }) => {
      // A hand-set rate for the day already holds the slot: it stays.
      if (error.code === 11000) return null;
      throw error;
    });
    if (res && (res.upsertedCount || res.modifiedCount)) kept += 1;
  }
  return { date, kept };
}

/** The currencies a workspace uses (accounts, transactions, rates), other than its base, that the provider covers. */
async function usedCurrencies(workspaceId: Types.ObjectId, base: string) {
  const [accounts, txns, rates] = await Promise.all([
    Account.distinct("currency", { workspaceId }),
    Transaction.distinct("currency", { workspaceId, deletedAt: null }),
    FxRate.distinct("currency", { workspaceId }),
  ]);
  return [...new Set([...accounts, ...txns, ...rates].map(String))].filter((c) => c !== base && providerCovers(c)).sort();
}

/**
 * Fetches the rate for an amount dated `asOf` when the workspace fetches
 * rates and the provider covers the currency. False when it couldn't.
 */
export async function fetchRateFor(workspaceId: Types.ObjectId, currency: string, asOf: string): Promise<boolean> {
  const workspace = await Workspace.findById(workspaceId).select("baseCurrency ownerUserId autoFxRates").lean();
  if (!workspace?.autoFxRates || !providerCovers(currency) || !providerCovers(workspace.baseCurrency)) return false;
  try {
    const today = isoDate(new Date());
    const reply = await fetchRates(workspace.baseCurrency, [currency], asOf >= today ? null : asOf);
    await storeRates(workspace, reply);
    return true;
  } catch (error) {
    console.error("fx rate fetch failed", error);
    return false;
  }
}

/** Fetches today's rates for every currency the workspace uses. */
async function refresh(workspace: { _id: Types.ObjectId; ownerUserId: Types.ObjectId; baseCurrency: string }) {
  if (!providerCovers(workspace.baseCurrency)) return { date: null, kept: 0, currencies: [] as string[] };
  const currencies = await usedCurrencies(workspace._id, workspace.baseCurrency);
  if (!currencies.length) return { date: null, kept: 0, currencies };
  const reply = await fetchRates(workspace.baseCurrency, currencies, null);
  return { ...(await storeRates(workspace, reply)), currencies };
}

/** "Refresh now" from the currency page: today's rates, whether or not the daily fetch is on. */
export function refreshRatesNow(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireAction(userId, workspaceId, "fx.manage");
    const workspace = await Workspace.findById(new Types.ObjectId(workspaceId)).select("baseCurrency ownerUserId").lean();
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    if (!providerCovers(workspace.baseCurrency)) throw new ApiError(400, "invalid_request", `The rates provider doesn't cover ${workspace.baseCurrency}`);
    try {
      return await refresh(workspace);
    } catch (error) {
      throw new ApiError(502, "fx_provider", error instanceof Error ? error.message : "The rates provider didn't answer");
    }
  });
}

/** The daily run: today's rates for every workspace that fetches them. */
export function runAutoFx() {
  return withDb(async () => {
    const workspaces = await Workspace.find({ autoFxRates: true }).select("baseCurrency ownerUserId").lean();
    let refreshed = 0;
    for (const workspace of workspaces) {
      try {
        if ((await refresh(workspace)).kept) refreshed += 1;
      } catch (error) {
        console.error("fx refresh failed", String(workspace._id), error);
      }
    }
    return { fxWorkspacesRefreshed: refreshed };
  });
}
