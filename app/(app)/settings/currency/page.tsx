import { CurrencyScreen } from "@/src/features/currency/CurrencyScreen";
import { requirePersonalWorkspace } from "@/src/server/api/personal";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function CurrencySettingsPage() {
  const { personal } = await requirePersonalWorkspace();
  const { sync } = await getLedgerProvider();
  const workspace = await sync.getWorkspace(personal.id);
  return (
    <CurrencyScreen
      workspaceId={personal.id}
      baseCurrency={personal.baseCurrency}
      fiscalYearStartMonth={personal.fiscalYearStartMonth}
      autoFxRates={workspace.autoFxRates}
    />
  );
}
