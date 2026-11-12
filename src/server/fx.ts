import type { Types } from "mongoose";
import { convertToBaseMinor, FX_RATE_SCALE } from "@/src/core/money";
import { FxRate } from "@/src/server/models";
import { ApiError } from "@/src/server/api/http";
import { isoDate } from "@/src/core/budgets/period";
import { needsFetch } from "@/src/core/fx-provider";
import { fetchRateFor } from "@/src/server/fx-auto";

function rateOn(workspaceId: Types.ObjectId, currency: string, asOf: Date) {
  return FxRate.findOne({ workspaceId, currency, effectiveFrom: { $lte: asOf } }).sort({ effectiveFrom: -1 });
}

/**
 * An amount in the workspace's base currency, at the rate in force on `asOf`
 * (the newest rate whose `effectiveFrom` is on or before it). When the
 * workspace fetches rates and there's none, or only a fetched one well
 * before that day (travel spending entered later), that day's rate is
 * fetched first.
 */
export async function toBaseAmount(input: {
  workspaceId: Types.ObjectId;
  amountMinor: number;
  currency: string;
  baseCurrency: string;
  asOf: Date;
}): Promise<number> {
  if (input.currency === input.baseCurrency) {
    return input.amountMinor;
  }
  let rate = await rateOn(input.workspaceId, input.currency, input.asOf);
  const found = rate ? { effectiveFrom: isoDate(rate.effectiveFrom), source: rate.source === "auto" ? ("auto" as const) : ("user" as const) } : null;
  if (needsFetch(found, isoDate(input.asOf), isoDate(new Date())) && (await fetchRateFor(input.workspaceId, input.currency, isoDate(input.asOf)))) {
    rate = (await rateOn(input.workspaceId, input.currency, input.asOf)) ?? rate;
  }
  if (!rate) {
    throw new ApiError(
      400,
      "missing_fx_rate",
      `Set an FX rate for ${input.currency} → ${input.baseCurrency} in Settings → Currency, or turn on fetching rates automatically`,
    );
  }
  return convertToBaseMinor(input.amountMinor, rate.rateToBaseScaled, FX_RATE_SCALE);
}
