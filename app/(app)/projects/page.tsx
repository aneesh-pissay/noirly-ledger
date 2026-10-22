import { ProjectsScreen } from "@/src/features/projects/ProjectsScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ProjectsPage() {
  const { personal } = await requirePersonalWorkspace();
  return <ProjectsScreen workspaceId={personal.id} baseCurrency={personal.baseCurrency} />;
}
