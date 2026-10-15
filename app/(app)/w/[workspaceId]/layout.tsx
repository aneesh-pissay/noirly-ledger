import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ApiError, getLedgerProvider } from "@/src/server/api/http";
import { WorkspaceRoleProvider } from "@/src/features/workspace/WorkspaceRoleContext";
import { WorkspaceRealtime } from "@/src/features/realtime/WorkspaceRealtime";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { workspaceId } = await params;
  const { sync } = await getLedgerProvider();

  const workspace = await sync.getWorkspace(workspaceId).catch((error: unknown) => {
    // Not a member, or no such workspace: the same 404 either way.
    if (error instanceof ApiError && (error.status === 400 || error.status === 403 || error.status === 404)) {
      notFound();
    }
    throw error;
  });

  return (
    <WorkspaceRoleProvider role={workspace.role}>
      <WorkspaceRealtime workspaceId={workspaceId} />
      {children}
    </WorkspaceRoleProvider>
  );
}
