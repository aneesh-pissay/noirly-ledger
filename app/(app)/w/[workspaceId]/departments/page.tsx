import { can } from "@/src/core/permissions/can";
import { DepartmentsScreen } from "@/src/features/departments/DepartmentsScreen";
import { requireSharedSection } from "@/src/server/api/shared-workspace";

export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const workspace = await requireSharedSection(workspaceId, "departments");
  return <DepartmentsScreen workspaceId={workspaceId} baseCurrency={workspace.baseCurrency} canManage={can(workspace.grant, "budget.manage")} />;
}
