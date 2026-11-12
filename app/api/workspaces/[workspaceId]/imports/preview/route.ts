import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { previewImport } from "@/src/server/imports/service";
import { readImportForm } from "@/src/server/imports/form";

/** Reads a statement and shows what importing it would add, with problems and likely duplicates marked. Saves nothing. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const form = await readImportForm(request);
    const { ctx } = await getLedgerProvider();
    return jsonOk({ preview: await previewImport(ctx.userId, workspaceId, form.file, { mapping: form.mapping, bank: form.bank, accountId: form.accountId }) });
  } catch (error) {
    return jsonError(error);
  }
}
