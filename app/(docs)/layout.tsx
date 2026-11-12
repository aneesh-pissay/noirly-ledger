import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AppShell } from "@/src/components/AppShell";
import { MarketingHeader } from "@/src/components/MarketingHeader";
import { ARTICLES, articleHref, navTree } from "@/src/docs/registry";
import { buildSearchDocs } from "@/src/docs/search";
import { DocsLayout } from "@/src/features/docs/DocsLayout";
import { listSessionWorkspaces, requireLedgerSession } from "@/src/server/api/http";

const nav = navTree();
const searchIndex = buildSearchDocs(ARTICLES, articleHref);

/**
 * The Docs are public: signed in, they sit in the app shell like any other
 * page; signed out (from the landing page), under the marketing header.
 */
export default async function DocsRootLayout({ children }: { children: ReactNode }) {
  const docs = <DocsLayout nav={nav} searchIndex={searchIndex}>{children}</DocsLayout>;
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="flex h-dvh flex-col">
        <MarketingHeader signIn />
        <main id="main" className="flex min-h-0 flex-1 flex-col">{docs}</main>
      </div>
    );
  }

  const [ctx, workspaces] = await Promise.all([requireLedgerSession(), listSessionWorkspaces()]);
  return (
    <AppShell user={{ displayName: ctx.displayName, email: ctx.email, numberFormat: ctx.numberFormat }} workspaces={workspaces}>
      {docs}
    </AppShell>
  );
}
