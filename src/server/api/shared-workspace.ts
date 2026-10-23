import { notFound } from "next/navigation";
import { getLedgerProvider } from "@/src/server/api/http";
import { hasSection, type WorkspacePurpose, type WorkspaceSection } from "@/src/core/workspace-purpose";

/**
 * A shared workspace page's workspace, or a 404 when what the workspace is for
 * doesn't include that page (the layout has already checked membership).
 */
export async function requireSharedSection(workspaceId: string, section: WorkspaceSection) {
  const { sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(workspaceId);
  const purpose = (workspace.purpose === "personal" ? null : workspace.purpose) as WorkspacePurpose | null;
  if (!purpose || !hasSection(purpose, section)) notFound();
  return workspace;
}
