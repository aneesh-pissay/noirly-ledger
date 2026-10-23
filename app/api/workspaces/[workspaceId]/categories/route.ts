import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { createCategoryBodySchema } from "@/src/core/schemas/ledger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getLedgerProvider();
    const categories = await sync.listCategories(workspaceId);
    return jsonOk({ categories });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createCategoryBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const category = await sync.createCategory({
      workspaceId,
      name: body.name,
      icon: body.icon,
      color: body.color,
      parentId: body.parentId ?? null,
      defaultGst: body.defaultGst ?? null,
    });
    return jsonOk({ category }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
