import type { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { Transaction as TransactionModel } from "@/src/server/models";
import { normalizeUpiId, normalizeUpiRef } from "@/src/core/upi";

/**
 * UPI fields as stored, or a 400 saying what's wrong. A reference already on
 * another live transaction in the workspace is a 409, since it's one payment.
 */
export async function upiFields(
  workspaceId: Types.ObjectId,
  input: { upiRef?: string | null; upiId?: string | null },
  exceptId?: Types.ObjectId,
) {
  let upiRef: string | null | undefined;
  let upiId: string | null | undefined;
  try {
    upiRef = input.upiRef === undefined ? undefined : normalizeUpiRef(input.upiRef);
    upiId = input.upiId === undefined ? undefined : normalizeUpiId(input.upiId);
  } catch (error) {
    throw new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Invalid UPI details");
  }
  if (upiRef) {
    const existing = await TransactionModel.findOne({ workspaceId, upiRef, deletedAt: null, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
      .select("date note")
      .lean();
    if (existing) {
      throw new ApiError(409, "duplicate_upi_ref", `That UPI reference is already recorded, on ${existing.date.toISOString().slice(0, 10)}${existing.note ? ` (${existing.note})` : ""}`);
    }
  }
  return {
    ...(upiRef === undefined ? {} : { upiRef }),
    ...(upiId === undefined ? {} : { upiId }),
  };
}
