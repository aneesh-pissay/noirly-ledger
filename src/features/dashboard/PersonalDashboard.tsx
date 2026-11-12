"use client";

import { Button, PageContainer, PageHeader } from "@noirly-dev/ui";
import { useUIStore } from "@/src/stores/ui-store";
import { WidgetDashboard } from "@/src/features/dashboard/WidgetDashboard";

type Props = {
  workspaceId: string;
  baseCurrency: string;
  displayName: string;
  fiscalYearStartMonth: number;
};

/** /home: the personal workspace's dashboard, made of the widgets you choose. */
export function PersonalDashboard({ workspaceId, baseCurrency, displayName, fiscalYearStartMonth }: Props) {
  const setOpen = useUIStore((s) => s.setTransactionComposerOpen);
  return (
    <PageContainer size="lg">
      <PageHeader
        eyebrow="Personal"
        title={`Welcome, ${displayName}`}
        lead="Where your money went, and what is left of it. Customize to choose what shows; click a category, merchant or bar to see its transactions."
        action={<Button onClick={() => setOpen(true)}>Add transaction</Button>}
      />
      <WidgetDashboard workspaceId={workspaceId} baseCurrency={baseCurrency} fiscalYearStartMonth={fiscalYearStartMonth} transactionsHref="/transactions" />
    </PageContainer>
  );
}
