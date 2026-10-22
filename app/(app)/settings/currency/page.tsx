import { CurrencyScreen } from "@/src/features/currency/CurrencyScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";

export default async function CurrencySettingsPage() {
  const { personal } = await requirePersonalWorkspace();
  return (
    <CurrencyScreen workspaceId={personal.id} baseCurrency={personal.baseCurrency} fiscalYearStartMonth={personal.fiscalYearStartMonth} />
  );
}
