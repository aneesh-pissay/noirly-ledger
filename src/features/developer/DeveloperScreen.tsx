"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { MAX_TOKENS, TOKEN_EXPIRY_DAYS, type TokenScope } from "@/src/core/access-tokens";
import { TEAM_ONLY_EVENTS, WEBHOOK_EVENT_LABEL, WEBHOOK_EVENTS, type WebhookEventType, type WebhookView } from "@/src/core/webhooks";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";

/** A secret shown once, with a copy button. */
function OnceSecret({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="mt-3 space-y-2 rounded-md border border-[var(--accent)] p-3 text-xs">
      <p>{label} It&apos;s shown this once; keep it somewhere safe.</p>
      <div className="flex gap-2">
        <input aria-label={label} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className={`${field} min-w-0 flex-1 font-mono text-xs`} />
        <Button type="button" variant="ghost" onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true), () => setCopied(false))}>{copied ? "Copied" : "Copy"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

/** Personal access tokens for the API, and the workspace's webhooks. */
export function DeveloperScreen({ initialWorkspaceId }: { initialWorkspaceId: string }) {
  return (
    <PageContainer size="md">
      <h1 className="text-2xl font-semibold tracking-tight">API and webhooks</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Use Ledger from your own scripts and apps: the same API the app uses, with a personal access token, and webhooks that tell your server when things change. See docs/API.md for the endpoints and how to check a webhook&apos;s signature.
      </p>
      <TokensSection />
      <WebhooksSection initialWorkspaceId={initialWorkspaceId} />
    </PageContainer>
  );
}

function TokensSection() {
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: ["access-tokens"], queryFn: () => api.listAccessTokens() });
  const [name, setName] = useState("");
  const [scope, setScope] = useState<TokenScope>("read");
  const [days, setDays] = useState<number>(90);
  const [made, setMade] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
  const create = useMutation({
    mutationFn: () => api.createAccessToken({ name: name.trim(), scope, days }),
    onSuccess: async (data) => {
      setMade(data.token);
      setName("");
      await refresh();
    },
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeAccessToken(id), onSuccess: refresh });
  const list = tokens.data?.tokens ?? [];

  return (
    <section aria-label="Access tokens" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
      <h2 className="font-medium">Personal access tokens</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Send one as <code className="font-mono">Authorization: Bearer nlp_…</code>. A token can do what you can, in every workspace you&apos;re in; a read-only one can only read. Tokens can&apos;t manage tokens or webhooks, link Flow or a calendar, or delete your account. Up to {MAX_TOKENS}.
      </p>
      {made ? <OnceSecret label="Your new token." value={made} onDone={() => setMade(null)} /> : null}
      <ul aria-label="Your tokens" className="mt-3 divide-y divide-[var(--hairline)]">
        {list.map((t) => (
          <li key={t.id} data-token={t.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{t.name}</span> <span className="font-mono text-xs text-[var(--muted-foreground)]">{t.hint}</span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                {t.scope === "read" ? "Read only" : "Read and write"} · {t.expiresAt ? `expires ${new Date(t.expiresAt).toLocaleDateString()}` : "never expires"} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : "not used yet"}
              </span>
            </span>
            <button type="button" className="text-xs underline hover:text-[var(--balance-negative)]" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Revoke ${t.name}? Anything using it stops working.`)) revoke.mutate(t.id); }}>Revoke</button>
          </li>
        ))}
        {!list.length && !tokens.isPending ? <li className="py-2 text-xs text-[var(--muted-foreground)]">No tokens yet.</li> : null}
      </ul>
      <form
        aria-label="New token"
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input aria-label="Token name" required maxLength={60} placeholder="e.g. Budget script" value={name} onChange={(e) => setName(e.target.value)} className={`${field} w-48`} />
        <select aria-label="Token scope" value={scope} onChange={(e) => setScope(e.target.value as TokenScope)} className={field}>
          <option value="read">Read only</option>
          <option value="write">Read and write</option>
        </select>
        <select aria-label="Token expiry" value={days} onChange={(e) => setDays(Number(e.target.value))} className={field}>
          {TOKEN_EXPIRY_DAYS.map((d) => <option key={d} value={d}>{d ? `${d} days` : "Never expires"}</option>)}
        </select>
        <Button type="submit" disabled={create.isPending}>Make token</Button>
      </form>
      {create.error ?? revoke.error ? <p role="alert" className="mt-2 text-[var(--balance-negative)]">{(create.error ?? revoke.error)!.message}</p> : null}
    </section>
  );
}

function WebhooksSection({ initialWorkspaceId }: { initialWorkspaceId: string }) {
  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => api.listWorkspaces() });
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const key = ["webhooks", workspaceId];
  const hooks = useQuery({ queryKey: key, queryFn: () => api.listWebhooks(workspaceId), retry: false });
  const workspace = workspaces.data?.workspaces.find((w) => w.id === workspaceId);
  const events = WEBHOOK_EVENTS.filter((e) => workspace?.kind === "team" || !TEAM_ONLY_EVENTS.includes(e));
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<WebhookEventType[]>(["transaction.created"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: () => api.createWebhook(workspaceId, { url: url.trim(), events: picked }),
    onSuccess: async (data) => {
      setSecret(data.secret);
      setUrl("");
      await refresh();
    },
  });
  const change = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onSuccess: refresh });
  const rotate = useMutation({ mutationFn: (id: string) => api.rotateWebhookSecret(id), onSuccess: (data) => setSecret(data.secret) });
  const error = create.error ?? change.error ?? rotate.error;

  return (
    <section aria-label="Webhooks" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
      <h2 className="font-medium">Webhooks</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Ledger POSTs each event you pick to your HTTPS URL, signed with the webhook&apos;s secret (the Noirly-Signature header, as Flow sends). Failed deliveries are retried for about 8 hours; a webhook that keeps failing turns itself off. Workspace managers set them up.
      </p>
      {(workspaces.data?.workspaces.length ?? 0) > 1 ? (
        <label className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">Workspace</span>
          <select aria-label="Webhook workspace" value={workspaceId} onChange={(e) => { setWorkspaceId(e.target.value); setSecret(null); }} className={field}>
            {workspaces.data!.workspaces.map((w) => <option key={w.id} value={w.id}>{w.kind === "personal" ? "Personal" : w.name}</option>)}
          </select>
        </label>
      ) : null}
      {secret ? <OnceSecret label="The webhook's signing secret." value={secret} onDone={() => setSecret(null)} /> : null}
      {hooks.error ? <p className="mt-3 text-xs text-[var(--muted-foreground)]">{hooks.error.message}</p> : null}
      {hooks.data ? (
        <>
          <ul aria-label="Workspace webhooks" className="mt-3 space-y-3">
            {hooks.data.webhooks.map((h) => <HookRow key={h.id} hook={h} open={openLog === h.id} onToggleLog={() => setOpenLog(openLog === h.id ? null : h.id)} change={(run) => change.mutate(run)} onRotate={() => { if (window.confirm("Make a new signing secret? The old one stops working at once.")) rotate.mutate(h.id); }} busy={change.isPending} />)}
            {!hooks.data.webhooks.length ? <li className="text-xs text-[var(--muted-foreground)]">No webhooks yet.</li> : null}
          </ul>
          <form
            aria-label="New webhook"
            className="mt-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <input aria-label="Webhook URL" required type="url" placeholder="https://example.com/ledger-hook" value={url} onChange={(e) => setUrl(e.target.value)} className={`${field} w-full font-mono text-xs`} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {events.map((e) => (
                <label key={e} className="flex items-center gap-1">
                  <input type="checkbox" checked={picked.includes(e)} onChange={() => setPicked(picked.includes(e) ? picked.filter((x) => x !== e) : [...picked, e])} />
                  {WEBHOOK_EVENT_LABEL[e]}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={create.isPending || !picked.length}>Add webhook</Button>
          </form>
        </>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-[var(--balance-negative)]">{error.message}</p> : null}
    </section>
  );
}

function HookRow({ hook, open, onToggleLog, change, onRotate, busy }: { hook: WebhookView; open: boolean; onToggleLog: () => void; change: (run: () => Promise<unknown>) => void; onRotate: () => void; busy: boolean }) {
  const deliveries = useQuery({ queryKey: ["webhook-deliveries", hook.id], queryFn: () => api.listWebhookDeliveries(hook.id), enabled: open });
  const queryClient = useQueryClient();
  const again = (run: () => Promise<unknown>) => change(async () => {
    await run();
    await queryClient.invalidateQueries({ queryKey: ["webhook-deliveries", hook.id] });
  });
  return (
    <li data-webhook={hook.url} className={`rounded-md border border-[var(--hairline)] p-3 ${hook.enabled ? "" : "opacity-70"}`}>
      <p className="break-all font-mono text-xs">{hook.url}</p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {hook.events.map((e) => WEBHOOK_EVENT_LABEL[e]).join(" · ")}
        {hook.enabled ? "" : ` · off${hook.disabledReason ? `: ${hook.disabledReason}` : ""}`}
        {hook.lastDeliveryAt ? ` · last ${hook.lastStatus} ${new Date(hook.lastDeliveryAt).toLocaleString()}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
        <button type="button" className="underline" disabled={busy} onClick={() => again(() => api.testWebhook(hook.id))}>Send test</button>
        <button type="button" className="underline" onClick={onToggleLog}>Deliveries</button>
        <button type="button" className="underline" disabled={busy} onClick={() => change(() => api.updateWebhook(hook.id, { enabled: !hook.enabled }))}>{hook.enabled ? "Turn off" : "Turn on"}</button>
        <button type="button" className="underline" onClick={onRotate}>New secret</button>
        <button type="button" className="underline hover:text-[var(--balance-negative)]" disabled={busy} onClick={() => { if (window.confirm("Delete this webhook?")) change(() => api.deleteWebhook(hook.id)); }}>Delete</button>
      </div>
      {open ? (
        <ul aria-label="Deliveries" className="mt-2 space-y-1 text-xs">
          {(deliveries.data?.deliveries ?? []).map((d) => (
            <li key={d.id} data-delivery={d.status} className={d.status === "failed" ? "text-[var(--balance-negative)]" : ""}>
              {new Date(d.createdAt).toLocaleString()} · {d.eventType} · {d.status}
              {d.lastStatusCode ? ` (${d.lastStatusCode})` : ""}
              {d.lastError ? ` — ${d.lastError}` : ""}
              {d.nextAttemptAt ? ` · retry ${new Date(d.nextAttemptAt).toLocaleTimeString()}` : ""}
              {d.status !== "pending" ? <button type="button" className="ml-2 underline" disabled={busy} onClick={() => again(() => api.redeliverWebhook(hook.id, d.id))}>Send again</button> : null}
            </li>
          ))}
          {deliveries.data && !deliveries.data.deliveries.length ? <li className="text-[var(--muted-foreground)]">Nothing sent yet.</li> : null}
        </ul>
      ) : null}
    </li>
  );
}
