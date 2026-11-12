import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { saveViewBodySchema } from "@/src/core/schemas/ledger";
import { createView, listViews } from "@/src/server/views";

/** The workspace's saved transaction views. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ views: await listViews(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Saves a search and its filters under a name. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = saveViewBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    return jsonOk({ view: await createView(ctx.userId, workspaceId, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
