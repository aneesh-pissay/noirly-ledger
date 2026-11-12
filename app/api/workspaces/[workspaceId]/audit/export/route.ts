import { getLedgerProvider, jsonError, assertObjectId } from "@/src/server/api/http";
import { exportAudit } from "@/src/server/audit";
import { auditCsv } from "@/src/core/audit";

/** The audit history as CSV, oldest first, with each entry's hash. Same filters as the list. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const q = new URL(request.url).searchParams;
    const { ctx } = await getLedgerProvider();
    const entries = await exportAudit(ctx.userId, workspaceId, {
      entity: q.get("entity") || undefined,
      actorId: q.get("actorId") || undefined,
      from: /^\d{4}-\d{2}-\d{2}$/.test(q.get("from") ?? "") ? q.get("from")! : undefined,
      to: /^\d{4}-\d{2}-\d{2}$/.test(q.get("to") ?? "") ? q.get("to")! : undefined,
    });
    return new Response(auditCsv(entries), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-history-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
