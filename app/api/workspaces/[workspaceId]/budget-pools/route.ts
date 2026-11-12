import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { createPoolBodySchema } from "@/src/core/schemas/ledger";
import { parseMajorToMinor } from "@/src/core/money";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { sync } = await getLedgerProvider();
    const pools = await sync.listBudgetPools(workspaceId);
    return jsonOk({ pools });
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
    const body = createPoolBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const pool = await sync.createBudgetPool({
      workspaceId,
      name: body.name,
      description: body.description ?? null,
      limitAmountMinor: parseMajorToMinor(body.limitMajor),
      currency: body.currency,
      template: body.template ?? null,
      periodStart: body.periodStart ?? null,
      periodEnd: body.periodEnd ?? null,
    });
    return jsonOk({ pool }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
