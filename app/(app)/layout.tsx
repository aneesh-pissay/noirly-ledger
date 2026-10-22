import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/src/components/AppShell";
import { listSessionWorkspaces, requireLedgerSession } from "@/src/server/api/http";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [ctx, workspaces] = await Promise.all([
    requireLedgerSession(),
    listSessionWorkspaces(),
  ]);

  return (
    <AppShell
      user={{ displayName: ctx.displayName, email: ctx.email, numberFormat: ctx.numberFormat }}
      workspaces={workspaces}
    >
      {children}
    </AppShell>
  );
}
