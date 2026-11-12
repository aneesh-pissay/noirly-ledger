import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Transaction as TransactionModel } from "@/src/server/models";
import { requireMembershipRole } from "@/src/server/workspace/members";
import { checkGstSettings, gstAmounts, gstSummary, normalizeGstin, normalizeHsn, type GstSettings, type GstTreatment } from "@/src/core/gst";
import type { TransactionType } from "@/src/core/models/enums";

/**
 * GST details as stored on a transaction: the settings, checked and tidied,
 * with the tax worked out from the amount (tax included). Transfers have
 * none; null clears it.
 */
export function gstFields(type: TransactionType, amountMinor: number, settings: GstSettings | null | undefined) {
  if (!settings) return null;
  if (type === "transfer") throw new ApiError(400, "invalid_request", "A transfer between your accounts has no GST");
  let gstin: string | null;
  let hsn: string | null;
  try {
    gstin = normalizeGstin(settings.gstin);
    hsn = normalizeHsn(settings.hsn);
  } catch (error) {
    throw new ApiError(400, "invalid_request", error instanceof Error ? error.message : "Invalid GST details");
  }
  const check = checkGstSettings(settings);
  if (!check.ok) throw new ApiError(400, "invalid_request", check.error);
  return {
    ratePct: settings.ratePct,
    treatment: settings.treatment,
    supply: settings.supply,
    gstin,
    hsn,
    itcEligible: Boolean(settings.itcEligible),
    ...gstAmounts(amountMinor, settings),
  };
}

/** The settings part of stored GST, to carry onto a refund or recompute after an edit. */
export function gstSettingsOf(stored: { ratePct: number; treatment: string; supply: string; gstin?: string | null; hsn?: string | null; itcEligible?: boolean | null } | null | undefined): GstSettings | null {
  if (!stored) return null;
  return {
    ratePct: stored.ratePct,
    treatment: stored.treatment as GstTreatment,
    supply: stored.supply as GstSettings["supply"],
    gstin: stored.gstin ?? null,
    hsn: stored.hsn ?? null,
    itcEligible: Boolean(stored.itcEligible),
  };
}

/** GST paid and collected between two dates, by currency and rate. */
export function getGstSummary(userId: string, workspaceId: string, from: string, to: string) {
  return withDb(async () => {
    await requireMembershipRole(userId, workspaceId);
    const docs = await TransactionModel.find({
      workspaceId: new Types.ObjectId(workspaceId),
      deletedAt: null,
      isPosted: true,
      gst: { $ne: null },
      date: { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) },
    })
      .select("type currency gst")
      .lean();
    return gstSummary(
      docs.map((d) => ({
        type: d.type,
        currency: d.currency,
        gst: d.gst
          ? {
              ratePct: d.gst.ratePct,
              treatment: d.gst.treatment as GstTreatment,
              itcEligible: Boolean(d.gst.itcEligible),
              taxableMinor: d.gst.taxableMinor,
              cgstMinor: d.gst.cgstMinor,
              sgstMinor: d.gst.sgstMinor,
              igstMinor: d.gst.igstMinor,
              taxMinor: d.gst.taxMinor,
            }
          : null,
      })),
    );
  });
}
