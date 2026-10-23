import { EnvelopesScreen } from "@/src/features/envelopes/EnvelopesScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function EnvelopesPage() {
  const { personal } = await requirePersonalWorkspace();
  return <EnvelopesScreen workspaceId={personal.id} />;
}
