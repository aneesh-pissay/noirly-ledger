import { getLedgerProvider, jsonError, assertObjectId } from "@/src/server/api/http";
import { exportWorkspaceJson } from "@/src/server/backups";
import { fileSlug } from "@/src/core/backup";

/** GET ?format=json — everything in the workspace as one JSON file, for those who run it. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    if (format !== "json") return Response.json({ error: "invalid_request", message: "format is json" }, { status: 400 });
    const { ctx } = await getLedgerProvider();
    const data = await exportWorkspaceJson(ctx.userId, workspaceId);
    const name = fileSlug(String(data.workspace.name ?? "workspace"));
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ledger-${name}-${data.exportedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
