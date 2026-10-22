import { cache } from "react";
import { headers } from "next/headers";
import { Types } from "mongoose";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { ensureLedgerAccount, type BootstrapSessionUser } from "@/src/server/auth/bootstrap";
import { extractBearerToken, fetchIdentityUserInfo } from "@/src/server/auth/identity-userinfo";
import { createMongoLedgerProvider } from "@/src/server/providers/mongo-ledger-provider";
import type { NumberFormat } from "@/src/core/locale-format";

export type LedgerSessionContext = {
  identitySub: string;
  userId: string;
  email: string;
  displayName: string;
  baseCurrency: string;
  numberFormat: NumberFormat;
};

export type PersonalWorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  kind: "personal";
  baseCurrency: string;
  fiscalYearStartMonth: number;
};

/**
 * One Mongo bootstrap + provider per request. Layout, pages, and nested
 * workspace layouts all share this — without it every sidebar hop upserted
 * the user twice and listed workspaces twice before painting.
 */
export const getLedgerProvider = cache(async () => {
  const account = await ensureLedgerAccount(await requestUser());

  const ctx: LedgerSessionContext = {
    identitySub: account.user.identitySub,
    userId: account.user.id,
    email: account.user.email,
    displayName: account.user.displayName,
    baseCurrency: account.user.baseCurrency,
    numberFormat: account.user.numberFormat,
  };

  return {
    ctx,
    sync: createMongoLedgerProvider({ userId: ctx.userId }),
    personal: account.personalWorkspace as PersonalWorkspaceSummary,
  };
});

/**
 * Who is calling: the mobile app sends an Identity access token (Bearer),
 * the web app a session cookie. Both resolve to the same Ledger account.
 */
async function requestUser(): Promise<BootstrapSessionUser> {
  const bearer = extractBearerToken((await headers()).get("authorization"));
  if (bearer) {
    let info;
    try {
      info = await fetchIdentityUserInfo(bearer);
    } catch {
      throw new ApiError(401, "unauthorized", "Invalid or expired access token");
    }
    return { id: info.sub, email: info.email ?? null, name: info.name ?? null, image: info.picture ?? null };
  }

  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "unauthorized", "Sign in required");
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name, image: session.user.image };
}

export const requireLedgerSession = cache(async (): Promise<LedgerSessionContext> => {
  const { ctx } = await getLedgerProvider();
  return ctx;
});

/** Sidebar workspace list — also request-cached so layout is the only caller that pays. */
export const listSessionWorkspaces = cache(async () => {
  const { sync } = await getLedgerProvider();
  return sync.listWorkspaces();
});

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json(data, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "invalid_request", message: error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }
  console.error(error);
  return Response.json(
    { error: "internal_error", message: "Something went wrong" },
    { status: 500 },
  );
}

export async function assertObjectId(id: string, label = "id") {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "invalid_request", `Invalid ${label}`);
  }
}
