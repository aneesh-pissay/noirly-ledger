"use client";

import Link from "next/link";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { MAX_RESTORE_BYTES, type RestoreResult } from "@/src/core/backup";

const LEFT_OUT: Record<string, string> = { auditEntries: "the audit history", webhooks: "webhooks", receiptInbox: "unmatched receipts" };

/** What a restore made, and what it couldn't bring back. */
export function RestoredNote({ result }: { result: RestoreResult }) {
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  return (
    <p role="status" data-restored={result.workspaceId} className="mt-3 text-xs">
      Restored {total} records as <Link className="underline" href={`/w/${result.workspaceId}`}>{result.name}</Link>, with you as its only owner.
      {" "}Receipt files, account numbers{result.skipped.length ? `, ${result.skipped.map((s) => LEFT_OUT[s] ?? s).join(", ")}` : ""} aren&apos;t brought back;
      {" "}scheduled exports and automations are paused{result.membersLeftOut ? `, and ${result.membersLeftOut} member${result.membersLeftOut === 1 ? " needs" : "s need"} inviting again` : ""}.
    </p>
  );
}

/** Restore an export or backup file as a new workspace: for when the original is gone, or to look at it as it was. */
export function RestoreSection() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_RESTORE_BYTES) throw new Error(`Files go up to ${MAX_RESTORE_BYTES / 1_048_576} MB`);
      return api.restoreUpload(file);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
    onSettled: () => { if (input.current) input.current.value = ""; },
  });

  return (
    <section aria-label="Restore from a file" className="mt-6 surface grain rounded-[var(--r-lg)] p-4 text-sm">
      <h2 className="font-medium">Restore from a file</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        An export (.json) or a downloaded backup (.json.gz) comes back as a new shared workspace. Nothing that exists now is changed.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <input ref={input} type="file" aria-label="Export or backup file" accept=".json,.gz,application/json,application/gzip" className="text-xs"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); }} disabled={upload.isPending} />
        {upload.isPending ? <Button type="button" variant="ghost" disabled>Restoring…</Button> : null}
      </div>
      {upload.data ? <RestoredNote result={upload.data.restored} /> : null}
      {upload.error ? <p role="alert" className="mt-3 text-xs text-[var(--balance-negative)]">{upload.error.message}</p> : null}
    </section>
  );
}
