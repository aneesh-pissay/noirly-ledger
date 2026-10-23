import { z } from "zod";
import { getLedgerProvider, jsonError, jsonOk } from "@/src/server/api/http";
import { WORKSPACE_PURPOSES } from "@/src/core/workspace-purpose";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: z.string().trim().length(3).default("USD"),
  purpose: z.enum(WORKSPACE_PURPOSES).default("team"),
});

export async function GET() {
  try {
    const { sync } = await getLedgerProvider();
    const workspaces = await sync.listWorkspaces();
    return jsonOk({ workspaces });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const { sync } = await getLedgerProvider();
    const workspace = await sync.createWorkspace({
      name: body.name,
      kind: "team",
      purpose: body.purpose,
      baseCurrency: body.baseCurrency.toUpperCase(),
    });
    return jsonOk({ workspace }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
