"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { COMMON_CURRENCIES } from "@/src/core/money";
import { PURPOSE_DESCRIPTION, PURPOSE_LABEL, WORKSPACE_PURPOSES, type WorkspacePurpose } from "@/src/core/workspace-purpose";

export function CreateTeamWorkspace() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<WorkspacePurpose>("household");
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { workspace } = await api.createWorkspace({ name, purpose, baseCurrency });
      setOpen(false);
      setName("");
      router.push(`/w/${workspace.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--accent)] hover:bg-[var(--surface)]"
      >
        + New shared workspace
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] p-3">
      <fieldset>
        <legend className="text-xs text-[var(--muted-foreground)]">For</legend>
        <div className="mt-1 space-y-1">
          {WORKSPACE_PURPOSES.map((value) => (
            <label key={value} className="flex items-start gap-2 text-sm" title={PURPOSE_DESCRIPTION[value]}>
              <input type="radio" name="purpose" value={value} checked={purpose === value} onChange={() => setPurpose(value)} className="mt-1" />
              <span>
                {PURPOSE_LABEL[value]}
                <span className="block text-[0.6875rem] text-[var(--muted-foreground)]">{PURPOSE_DESCRIPTION[value]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs text-[var(--muted-foreground)]" htmlFor="team-name">
        Name
      </label>
      <input
        id="team-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
        placeholder={purpose === "household" ? "Our home" : purpose === "business" ? "My shop" : "Marketing"}
        required
        autoFocus
      />
      <label className="block text-xs text-[var(--muted-foreground)]" htmlFor="team-currency">
        Base currency
      </label>
      <select
        id="team-currency"
        value={baseCurrency}
        onChange={(e) => setBaseCurrency(e.target.value)}
        className="w-full rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)]"
      >
        {COMMON_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
      </select>
      {error ? <p className="text-xs text-[var(--balance-negative)]">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-md border border-[var(--hairline)] px-3 py-1.5 text-sm text-[var(--muted-foreground)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
