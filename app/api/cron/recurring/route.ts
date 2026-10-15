import { jsonError, jsonOk, ApiError } from "@/src/server/api/http";
import { runRecurringEngine } from "@/src/server/recurring/run";
import { bearerMatches } from "@/src/server/security/bearer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) {
      throw new ApiError(404, "not_found", "Not found");
    }
    if (!bearerMatches(request.headers.get("authorization"), secret)) {
      throw new ApiError(401, "unauthorized", "Invalid cron secret");
    }
    const result = await runRecurringEngine();
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
