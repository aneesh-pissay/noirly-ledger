import {
  ApiError,
  assertObjectId,
  getLedgerProvider,
  jsonError,
} from "@/src/server/api/http";
import { exportBodySchema } from "@/src/core/schemas/ledger";
import { requireAction } from "@/src/server/workspace/members";
import { buildExportFile } from "@/src/server/exports/build";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = exportBodySchema.parse(await request.json());
    if (body.from > body.to) {
      throw new ApiError(400, "invalid_request", "from must be on or before to");
    }
    if (body.template === "pool" && !body.budgetPoolId) {
      throw new ApiError(400, "invalid_request", "budgetPoolId is required for pool reports");
    }
    const { ctx, sync } = await getLedgerProvider();
    await requireAction(ctx.userId, workspaceId, "report.export");
    const workspace = await sync.getWorkspace(workspaceId);
    const file = await buildExportFile(
      { workspaceId, from: body.from, to: body.to, budgetPoolId: body.budgetPoolId ?? null, template: body.template },
      body.format,
      workspace.name,
      workspace.baseCurrency,
    );
    return new Response(new Uint8Array(file.content), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.filename}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
