import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { departmentBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";
import { createDepartment, listDepartments } from "@/src/server/departments";

/** Departments and teams, with where each budget stands this period, and the caller's default. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getLedgerProvider();
    return jsonOk(await listDepartments(ctx.userId, workspaceId));
  } catch (error) {
    return jsonError(error);
  }
}

/** Adds a department, or a team under one (parentId). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { budgetMajor, ...body } = departmentBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    const department = await createDepartment(ctx.userId, workspaceId, {
      ...body,
      parentId: body.parentId ?? null,
      budgetMinor: budgetMajor ? parseMajorToMinor(budgetMajor) : null,
    });
    return jsonOk({ department }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
