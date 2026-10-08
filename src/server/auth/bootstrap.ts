import { withDb } from "@/src/server/db/mongodb";
import { seedSystemCategories } from "@/src/server/categories/seed";
import {
  LedgerUser,
  Workspace,
  WorkspaceMember,
  type LedgerUserDocument,
  type WorkspaceDocument,
} from "@/src/server/models";

export type BootstrapSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export type BootstrappedAccount = {
  user: {
    id: string;
    identitySub: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    baseCurrency: string;
  };
  personalWorkspace: {
    id: string;
    name: string;
    slug: string;
    kind: "personal";
    baseCurrency: string;
  };
};

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "workspace";
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/** The user's personal workspace: the oldest one, so a past duplicate never wins. */
function findPersonalWorkspace(userId: LedgerUserDocument["_id"]) {
  return Workspace.findOne({ ownerUserId: userId, kind: "personal" }).sort({ createdAt: 1, _id: 1 });
}

/**
 * Looked up by owner + kind rather than through "any membership where I am
 * owner": that query could return a team workspace the user owns, miss the
 * personal one, and create a second. Concurrent first requests (layout, page
 * and API calls all bootstrap) are settled by the partial unique index on
 * Workspace { ownerUserId } for kind "personal": the loser re-reads the winner.
 */
async function ensurePersonalWorkspace(
  user: LedgerUserDocument,
): Promise<WorkspaceDocument> {
  const existing = await findPersonalWorkspace(user._id);
  // Categories are seeded at create time. Do not count/seed on every nav hop.
  if (existing) return existing;

  const slugBase = slugify(`${user.displayName}-personal`);
  let workspace: WorkspaceDocument | null = null;
  for (let n = 0; !workspace && n < 50; n += 1) {
    const slug = n === 0 ? slugBase : `${slugBase}-${n}`;
    if (await Workspace.exists({ slug })) continue;
    try {
      workspace = await Workspace.create({
        kind: "personal",
        name: "Personal",
        slug,
        ownerUserId: user._id,
        baseCurrency: user.baseCurrency || "USD",
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // Either another request created this user's personal workspace, or
      // someone else took the slug between our check and insert.
      const winner = await findPersonalWorkspace(user._id);
      if (winner) return winner;
    }
  }
  if (!workspace) throw new Error("Could not allocate a personal workspace slug");

  await WorkspaceMember.updateOne(
    { workspaceId: workspace._id, userId: user._id },
    { $setOnInsert: { workspaceId: workspace._id, userId: user._id, role: "owner" } },
    { upsert: true },
  );

  await seedSystemCategories(workspace._id);
  return workspace;
}

/**
 * Resolve the Ledger user + personal workspace for an Identity session.
 *
 * Hot path is read-only: find the user, reuse the personal workspace, return.
 * Writes only when the account is missing or profile fields actually changed.
 */
export async function ensureLedgerAccount(
  sessionUser: BootstrapSessionUser,
): Promise<BootstrappedAccount> {
  if (!sessionUser.id) {
    throw new Error("Session is missing Identity subject (sub)");
  }

  return withDb(async () => {
    const email =
      sessionUser.email?.trim().toLowerCase() || `${sessionUser.id}@users.local`;
    const displayName =
      sessionUser.name?.trim() || email.split("@")[0] || "Noirly user";
    const avatarUrl = sessionUser.image ?? null;
    const emailVerified = Boolean(sessionUser.email);

    let user = await LedgerUser.findOne({ identitySub: sessionUser.id });

    if (!user) {
      try {
        user = await LedgerUser.create({
          identitySub: sessionUser.id,
          email,
          displayName,
          avatarUrl,
          emailVerified,
          baseCurrency: "USD",
          locale: "en-US",
        });
      } catch (error) {
        // A concurrent first request created the user (unique identitySub).
        if (!isDuplicateKey(error)) throw error;
        user = await LedgerUser.findOne({ identitySub: sessionUser.id });
        if (!user) throw error;
      }
    } else {
      const needsUpdate =
        user.email !== email ||
        user.displayName !== displayName ||
        (user.avatarUrl ?? null) !== avatarUrl ||
        user.emailVerified !== emailVerified;

      if (needsUpdate) {
        user.email = email;
        user.displayName = displayName;
        user.avatarUrl = avatarUrl;
        user.emailVerified = emailVerified;
        await user.save();
      }
    }

    const workspace = await ensurePersonalWorkspace(user);

    return {
      user: {
        id: user._id.toString(),
        identitySub: user.identitySub,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? null,
        baseCurrency: user.baseCurrency,
      },
      personalWorkspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        slug: workspace.slug,
        kind: "personal",
        baseCurrency: workspace.baseCurrency,
      },
    };
  });
}
