import { getLedgerProvider, jsonError, jsonOk, refuseAccessToken } from "@/src/server/api/http";
import { accessTokenBodySchema } from "@/src/core/schemas/ledger";
import { createAccessToken, listAccessTokens } from "@/src/server/access-tokens";

/** Your live access tokens (never the tokens themselves). Managing them needs you signed in. */
export async function GET() {
  try {
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Managing access tokens");
    return jsonOk({ tokens: await listAccessTokens(ctx.userId) });
  } catch (error) {
    return jsonError(error);
  }
}

/** Makes a token; it's in this answer and nowhere else, ever. */
export async function POST(request: Request) {
  try {
    const body = accessTokenBodySchema.parse(await request.json());
    const { ctx } = await getLedgerProvider();
    refuseAccessToken(ctx, "Managing access tokens");
    return jsonOk(await createAccessToken(ctx.userId, body), 201);
  } catch (error) {
    return jsonError(error);
  }
}
