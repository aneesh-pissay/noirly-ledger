import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { dashboardLayoutBodySchema } from "@/src/core/schemas/ledger";
import { getDashboardLayout, saveDashboardLayout } from "@/src/server/dashboard-layout";
import type { Widget } from "@/src/core/dashboard-widgets";

/** The caller's dashboard widgets in this workspace. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await getDashboardLayout(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Saves the caller's widgets (`{ widgets }`), or `{ widgets: null }` to go back to the default. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = dashboardLayoutBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    // Unknown widget types are dropped when the layout is cleaned.
    return jsonOk(await saveDashboardLayout(ctx.userId, workspaceId, body.widgets as Widget[] | null));
  } catch (error) {
    return jsonError(error);
  }
}
