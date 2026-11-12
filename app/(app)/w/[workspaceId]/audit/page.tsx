import { AuditScreen } from "@/src/features/audit/AuditScreen";

export default async function WorkspaceAuditPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return <AuditScreen workspaceId={workspaceId} />;
}
