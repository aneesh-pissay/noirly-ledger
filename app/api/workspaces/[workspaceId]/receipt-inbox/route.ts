import { ApiError, getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { listInbox, uploadReceipts } from "@/src/server/receipt-inbox";

/** Receipts waiting to be matched to transactions, each with its likely ones, then recently matched ones. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listInbox(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Uploads several receipts at once (form field "files"), to match afterwards. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const form = await request.formData().catch(() => {
      throw new ApiError(400, "invalid_request", "Send the receipts as a form");
    });
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const { ctx } = await getLedgerProvider();
    const uploaded = await uploadReceipts(
      ctx.userId,
      workspaceId,
      await Promise.all(files.map(async (file) => ({ name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) }))),
    );
    return jsonOk({ uploaded }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
