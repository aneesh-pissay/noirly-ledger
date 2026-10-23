"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { Select } from "@/src/components/Select";
import { PURPOSE_DESCRIPTION, PURPOSE_LABEL, WORKSPACE_PURPOSES, type WorkspacePurpose } from "@/src/core/workspace-purpose";

/** Lets the owner change what a shared workspace is for; its menu and pages follow. Its data stays as it is. */
export function PurposeSetting({ workspaceId, purpose }: { workspaceId: string; purpose: WorkspacePurpose }) {
  const router = useRouter();
  const [value, setValue] = useState(purpose);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function change(next: WorkspacePurpose) {
    setValue(next);
    setError(null);
    setPending(true);
    try {
      await api.updateWorkspaceSettings(workspaceId, { purpose: next });
      router.refresh();
    } catch (err) {
      setValue(purpose);
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="What this workspace is for" className="mt-8 max-w-md">
      <Label htmlFor="ws-purpose">What this workspace is for</Label>
      <Select id="ws-purpose" value={value} disabled={pending} onChange={(e) => void change(e.target.value as WorkspacePurpose)}>
        {WORKSPACE_PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p]}</option>)}
      </Select>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{PURPOSE_DESCRIPTION[value]} Changing it changes the menu; nothing is deleted.</p>
      {error ? <p role="alert" className="mt-1 text-sm text-[var(--balance-negative)]">{error}</p> : null}
    </section>
  );
}
