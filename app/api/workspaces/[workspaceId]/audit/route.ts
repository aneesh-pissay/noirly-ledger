import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listAudit } from "@/src/server/audit";

/** A page of the audit history, newest first. Query: entity, actorId, entityId, from, to, before (a seq), limit. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const q = new URL(request.url).searchParams;
    const { ctx } = await getLedgerProvider();
    return jsonOk(
      await listAudit(ctx.userId, workspaceId, {
        entity: q.get("entity") || undefined,
        actorId: q.get("actorId") || undefined,
        entityId: q.get("entityId") || undefined,
        from: /^\d{4}-\d{2}-\d{2}$/.test(q.get("from") ?? "") ? q.get("from")! : undefined,
        to: /^\d{4}-\d{2}-\d{2}$/.test(q.get("to") ?? "") ? q.get("to")! : undefined,
        before: Number(q.get("before")) || undefined,
        limit: Number(q.get("limit")) || undefined,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
