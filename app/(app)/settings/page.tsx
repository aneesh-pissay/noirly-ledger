import { PageContainer } from "@noirly-dev/ui";
import Link from "next/link";
import { getLedgerProvider } from "@/src/server/api/http";

export default async function SettingsPage() {
  const { ctx } = await getLedgerProvider();

  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <dl className="mt-6 space-y-4 surface grain rounded-[var(--r-lg)] p-5 text-sm">
        <div>
          <dt className="text-[var(--muted-foreground)]">Display name</dt>
          <dd className="mt-1 text-[var(--foreground)]">{ctx.displayName}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted-foreground)]">Email</dt>
          <dd className="mt-1 font-mono text-[var(--foreground)]">{ctx.email}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted-foreground)]">Base currency</dt>
          <dd className="mt-1 font-mono text-[var(--accent)]">{ctx.baseCurrency}</dd>
        </div>
      </dl>
      <Link
        href="/settings/currency"
        className="mt-6 inline-block text-sm text-[var(--accent)] hover:underline"
      >
        Manage FX rates →
      </Link>
      <Link
        href="/settings/notifications"
        className="mt-3 block text-sm text-[var(--accent)] hover:underline"
      >
        Notifications and reminders →
      </Link>
      <Link
        href="/settings/flow"
        className="mt-3 block text-sm text-[var(--accent)] hover:underline"
      >
        Noirly Flow: bills as tasks →
      </Link>
      <Link
        href="/settings/calendar"
        className="mt-3 block text-sm text-[var(--accent)] hover:underline"
      >
        Google Calendar: bills on your calendar →
      </Link>
      <Link
        href="/settings/api"
        className="mt-3 block text-sm text-[var(--accent)] hover:underline"
      >
        API tokens and webhooks →
      </Link>
      <Link
        href="/settings/backups"
        className="mt-3 block text-sm text-[var(--accent)] hover:underline"
      >
        Export, backups and retention →
      </Link>
    </PageContainer>
  );
}
