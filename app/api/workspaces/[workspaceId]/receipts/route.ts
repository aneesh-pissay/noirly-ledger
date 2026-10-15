import { ApiError, getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { saveReceipt } from "@/src/server/storage/receipts";
import { requireAction } from "@/src/server/workspace/members";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    // Only members can add receipts to a workspace.
    await withDb(() => requireAction(ctx.userId, workspaceId, "expense.submit"));
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "invalid_request", "file is required");
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const saved = await saveReceipt({
      workspaceId,
      bytes,
      mime: file.type || "image/jpeg",
    });
    return jsonOk(saved, 201);
  } catch (error) {
    return jsonError(error);
  }
}
