import { getLedgerProvider, jsonError, jsonOk, assertObjectId } from "@/src/server/api/http";
import { bulkCreateBodySchema } from "@/src/core/schemas/ledger";
import { bulkCreateTransactions } from "@/src/server/bulk";
import { createInputFromBody } from "@/src/server/transactions/input";

/** Adds several transactions at once, all or nothing. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = bulkCreateBodySchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const transactions = await bulkCreateTransactions(sync, body.transactions.map((t) => createInputFromBody(workspaceId, t)));
    return jsonOk({ transactions }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
