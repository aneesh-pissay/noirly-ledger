import { ForecastScreen } from "@/src/features/forecast/ForecastScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function ForecastPage() {
  const { personal } = await requirePersonalWorkspace();
  return <ForecastScreen workspaceId={personal.id} />;
}
