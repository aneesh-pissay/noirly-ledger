import { ApiError, getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { commitImport, listImports } from "@/src/server/imports/service";
import { readImportForm } from "@/src/server/imports/form";

/** The workspace's recent statement imports. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk({ batches: await listImports(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Imports a statement's good rows (all or none) as one batch that can be undone. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const form = await readImportForm(request);
    if (!form.mapping) throw new ApiError(400, "invalid_request", "Say which column is which before importing");
    const { ctx, sync } = await getLedgerProvider();
    const batch = await commitImport(sync, ctx.userId, workspaceId, form.file, {
      mapping: form.mapping,
      accountId: form.accountId,
      categoryId: form.categoryId,
      skipLines: form.skipLines,
    });
    return jsonOk({ batch }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
