import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { deleteBudgetTemplate } from "@/src/server/budget-templates";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  try {
    const { templateId } = await params;
    await assertObjectId(templateId, "templateId");
    const { ctx } = await getLedgerProvider();
    await deleteBudgetTemplate(ctx.userId, templateId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
