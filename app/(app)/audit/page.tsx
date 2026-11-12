import { AuditScreen } from "@/src/features/audit/AuditScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function AuditPage() {
  const { personal } = await requirePersonalWorkspace();
  return <AuditScreen workspaceId={personal.id} />;
}
