import { jsonError, jsonOk, ApiError } from "@/src/server/api/http";
import { runRecurringEngine } from "@/src/server/recurring/run";
import { runBillReminders } from "@/src/server/reminders";
import { runPriceAlerts } from "@/src/server/subscription-insights";
import { bearerMatches } from "@/src/server/security/bearer";
import { runApprovalEscalations } from "@/src/server/escalations";
import { runScheduledExports } from "@/src/server/scheduled-exports";
import { runAutoFx } from "@/src/server/fx-auto";
import { runDueAutomations } from "@/src/server/automations";
import { runFlowSync } from "@/src/server/flow";
import { sweepWebhookDeliveries } from "@/src/server/webhooks";
import { sealExistingNotes } from "@/src/server/seal-existing";
import { runDueBackups } from "@/src/server/backups";
import { runRetention } from "@/src/server/retention";

export const runtime = "nodejs";

/**
 * The daily job. Vercel Cron calls it with GET (vercel.json) and sends
 * `Authorization: Bearer $CRON_SECRET`; `pnpm recurring:run` and the e2e
 * tests use POST. Both run the same thing, and both need the secret.
 */
export async function GET(request: Request) {
  return runDaily(request);
}

export async function POST(request: Request) {
  return runDaily(request);
}

async function runDaily(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) {
      throw new ApiError(404, "not_found", "Not found");
    }
    if (!bearerMatches(request.headers.get("authorization"), secret)) {
      throw new ApiError(401, "unauthorized", "Invalid cron secret");
    }
    // Today's exchange rates first, so what's posted next converts at them.
    const fx = await runAutoFx();
    // Post what's due first, so reminders don't go out for charges just recorded.
    const result = await runRecurringEngine();
    const reminders = await runBillReminders();
    const prices = await runPriceAlerts();
    const approvals = await runApprovalEscalations();
    const exports = await runScheduledExports();
    const automations = await runDueAutomations();
    // Last, so Flow sees today's charges recorded and today's payments made.
    const flow = await runFlowSync();
    // Webhook retries also go out with requests; this catches quiet days.
    const webhooks = await sweepWebhookDeliveries(200);
    // Notes from before they were sealed, a batch a day until none are left.
    const sealing = await sealExistingNotes();
    // What workspaces no longer keep goes before the backups, so backups don't hold it.
    const retention = await runRetention();
    // Backups last, so they hold today's changes.
    const backups = await runDueBackups();
    return jsonOk({ ...fx, ...result, ...reminders, ...prices, ...approvals, ...exports, ...automations, ...flow, ...webhooks, ...sealing, ...retention, ...backups });
  } catch (error) {
    return jsonError(error);
  }
}
