import type { Types } from "mongoose";
import { convertToBaseMinor, FX_RATE_SCALE } from "@/src/core/money";
import { FxRate } from "@/src/server/models";
import { ApiError } from "@/src/server/api/http";

/**
 * An amount in the workspace's base currency, at the rate in force on `asOf`
 * (the newest rate whose `effectiveFrom` is on or before it).
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
  const rate = await FxRate.findOne({
    workspaceId: input.workspaceId,
    currency: input.currency,
    effectiveFrom: { $lte: input.asOf },
  }).sort({ effectiveFrom: -1 });
  if (!rate) {
    throw new ApiError(
      400,
      "missing_fx_rate",
      `Set an FX rate for ${input.currency} → ${input.baseCurrency} in Settings → Currency`,
    );
  }
  return convertToBaseMinor(input.amountMinor, rate.rateToBaseScaled, FX_RATE_SCALE);
}
