import { PageContainer } from "@noirly-dev/ui";
import Link from "next/link";
import { getLedgerProvider } from "@/src/server/api/http";
import { can } from "@/src/core/permissions/can";
import { PoolListPreview } from "@/src/features/pools/PoolListPreview";
import { PurposeSetting } from "@/src/features/workspace/PurposeSetting";
import { hasSection, poolsLabel, PURPOSE_DESCRIPTION, PURPOSE_LABEL, type WorkspacePurpose } from "@/src/core/workspace-purpose";

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(workspaceId);
  const canDecide = can(workspace.role, "expense.decide");
  const purpose = (workspace.purpose === "personal" ? "team" : workspace.purpose) as WorkspacePurpose;
  const base = `/w/${workspaceId}`;

  // The workspace's pages, as cards, in the order its menu has them.
  const cards = [
    hasSection(purpose, "transactions") ? { href: `${base}/transactions`, label: "Transactions" } : null,
    hasSection(purpose, "accounts") ? { href: `${base}/accounts`, label: "Accounts" } : null,
    hasSection(purpose, "budgets") ? { href: `${base}/budgets`, label: "Budgets" } : null,
    { href: `${base}/pools`, label: poolsLabel(purpose) },
    hasSection(purpose, "expenses") ? { href: `${base}/expenses/new`, label: "Submit expense" } : null,
    hasSection(purpose, "approvals") && canDecide ? { href: `${base}/approvals`, label: "Approvals" } : null,
    { href: `${base}/members`, label: "Members" },
  ].filter((card): card is { href: string; label: string } => card != null);

  return (
    <PageContainer size="lg">
      <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--accent)]">
        {PURPOSE_LABEL[purpose].toUpperCase()} · {workspace.role.toUpperCase()}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{workspace.name}</h1>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        {PURPOSE_DESCRIPTION[purpose]} Base currency{" "}
        <span className="font-mono text-[var(--foreground)]">{workspace.baseCurrency}</span>.
        {hasSection(purpose, "approvals") ? " Expenses post to a pool only after an approver decides." : ""}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="surface grain rounded-[var(--r-lg)] p-5 surface-interactive"
          >
            <p className="text-sm font-medium text-[var(--foreground)]">{card.label}</p>
          </Link>
        ))}
      </div>

      <PoolListPreview workspaceId={workspaceId} />
      {can(workspace.role, "workspace.manage") ? <PurposeSetting workspaceId={workspaceId} purpose={purpose} /> : null}
    </PageContainer>
  );
}
