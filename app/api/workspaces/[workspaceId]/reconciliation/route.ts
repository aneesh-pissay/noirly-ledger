import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { reconciliationReport } from "@/src/server/reconciliation";
import { reconReportCsv } from "@/src/core/reconciliation";
import { formatMinorToMajor } from "@/src/core/money";

/** Every account's reconciliation standing and the reconciliations made; `?format=csv` downloads it. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    const report = await reconciliationReport(ctx.userId, workspaceId);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      return new Response(reconReportCsv(report, formatMinorToMajor), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="reconciliation-${report.asOf}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return jsonOk(report);
  } catch (error) {
    return jsonError(error);
  }
}
