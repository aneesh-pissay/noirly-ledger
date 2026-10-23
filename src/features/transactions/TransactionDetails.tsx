"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Textarea } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { FIELD_LABEL, MAX_ATTACHMENTS, type FieldChange } from "@/src/core/history";
import { CLEARING_LABEL, clearingOf } from "@/src/core/clearing";
import { formatUpiRef } from "@/src/core/upi";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import type { Transaction } from "@/src/core/sync/types";

type Props = {
  workspaceId: string;
  transaction: Transaction | null;
  onClose: () => void;
  /** Names for ids shown in the history. */
  categoryName: (id: string | null) => string;
  accountName: (id: string | null) => string;
  projectName: (id: string | null) => string | null;
};

const ACTION_LABEL = {
  created: "Added",
  updated: "Changed",
  deleted: "Deleted",
  attachment_added: "Attached",
  attachment_removed: "Removed file",
} as const;

/** When something happened, in the viewer's own time. */
function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function size(bytes: number) {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** One transaction's files, comments and change history. */
export function TransactionDetails({ workspaceId, transaction, onClose, categoryName, accountName, projectName }: Props) {
  return (
    <Dialog open={Boolean(transaction)} title="Transaction details" onClose={onClose}>
      {transaction ? (
        <DetailsBody key={transaction.id} workspaceId={workspaceId} transaction={transaction} categoryName={categoryName} accountName={accountName} projectName={projectName} />
      ) : null}
    </Dialog>
  );
}

function DetailsBody({ workspaceId, transaction, categoryName, accountName, projectName }: Omit<Props, "onClose" | "transaction"> & { transaction: Transaction }) {
  const queryClient = useQueryClient();
  const { money } = useMoneyFormat();
  const key = ["transaction-activity", transaction.id];
  const activity = useQuery({ queryKey: key, queryFn: () => api.getTransactionActivity(transaction.id) });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: qk.transactions(workspaceId) });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const saved = await api.uploadReceipt(workspaceId, file);
      await api.addAttachment(transaction.id, { storageKey: saved.key, name: file.name, contentType: file.type || "application/octet-stream", size: file.size });
    },
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });
  const removeFile = useMutation({
    mutationFn: (attachmentId: string) => api.removeAttachment(transaction.id, attachmentId),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });
  const post = useMutation({
    mutationFn: () => api.addComment(transaction.id, comment.trim()),
    onMutate: () => setError(null),
    onSuccess: () => { setComment(""); refresh(); },
    onError: (err: Error) => setError(err.message),
  });
  const removeComment = useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onSuccess: refresh,
  });

  const value = (change: FieldChange, side: "from" | "to") => {
    const raw = change[side];
    if (raw == null || raw === "") return "—";
    if (change.field === "amountMinor") return money(Number(raw), transaction.currency);
    if (change.field === "categoryId") return categoryName(String(raw));
    if (change.field === "accountId" || change.field === "toAccountId") return accountName(String(raw));
    if (change.field === "projectId") return projectName(String(raw)) ?? "—";
    if (change.field === "clearing") return CLEARING_LABEL[clearingOf(String(raw))];
    if (change.field === "splits") return "split lines";
    return String(raw);
  };

  const data = activity.data?.activity;
  return (
    <div className="space-y-5">
      <p className="text-sm">
        <span className="font-mono">{money(transaction.type === "expense" ? -transaction.amountMinor : transaction.amountMinor, transaction.currency)}</span>
        <span className="text-[var(--muted-foreground)]"> · {transaction.date} · {transaction.merchant ?? transaction.note ?? categoryName(transaction.categoryId)}</span>
      </p>
      {transaction.upiRef || transaction.upiId ? (
        <p className="font-mono text-xs text-[var(--muted-foreground)]">
          UPI{transaction.upiRef ? ` ${formatUpiRef(transaction.upiRef)}` : ""}{transaction.upiId ? ` · ${transaction.upiId}` : ""}
        </p>
      ) : null}

      <section aria-label="Files">
        <h3 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">Files</h3>
        {transaction.receiptUrl ? (
          <a href={transaction.receiptUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm underline">Receipt</a>
        ) : null}
        <ul className="mt-2 space-y-1 text-sm">
          {(data?.attachments ?? []).map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3">
              <a href={file.url} target="_blank" rel="noreferrer" className="truncate underline">{file.name}</a>
              <span className="flex shrink-0 items-center gap-3 text-xs text-[var(--muted-foreground)]">
                {size(file.size)}
                {data?.canEdit ? (
                  <button type="button" aria-label={`Remove ${file.name}`} className="hover:text-[var(--balance-negative)]" onClick={() => removeFile.mutate(file.id)}>Remove</button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {data?.canEdit && (data.attachments.length < MAX_ATTACHMENTS) ? (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs underline">
            {upload.isPending ? "Uploading…" : "Attach a file"}
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={upload.isPending}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = ""; }}
            />
          </label>
        ) : null}
      </section>

      <section aria-label="Comments">
        <h3 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">Comments</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(data?.comments ?? []).map((c) => (
            <li key={c.id} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
              <p className="whitespace-pre-wrap">{c.body}</p>
              <p className="mt-1 flex justify-between text-xs text-[var(--muted-foreground)]">
                <span>{c.authorName} · {when(c.createdAt)}</span>
                {c.canDelete ? <button type="button" className="hover:text-[var(--balance-negative)]" onClick={() => removeComment.mutate(c.id)}>Delete</button> : null}
              </p>
            </li>
          ))}
        </ul>
        <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) post.mutate(); }}>
          <Textarea aria-label="Add a comment" maxLength={2000} value={comment} placeholder="Add a comment" onChange={(e) => setComment(e.target.value)} />
          <Button type="submit" size="sm" variant="ghost" disabled={!comment.trim() || post.isPending}>Comment</Button>
        </form>
      </section>

      <section aria-label="History">
        <h3 className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">History</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(data?.history ?? []).map((entry) => (
            <li key={entry.id} data-history={entry.action}>
              <p>
                {ACTION_LABEL[entry.action]}
                {entry.detail ? ` ${entry.detail}` : ""}
                <span className="text-xs text-[var(--muted-foreground)]"> · {entry.actorName} · {when(entry.createdAt)}</span>
              </p>
              {entry.changes.length ? (
                <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted-foreground)]">
                  {entry.changes.map((change) => (
                    <li key={change.field}>{FIELD_LABEL[change.field]}: {value(change, "from")} → {value(change, "to")}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
          {data && !data.history.length ? <li className="text-[var(--muted-foreground)]">Nothing recorded yet. Changes are kept from now on.</li> : null}
        </ul>
      </section>
      {error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{error}</p> : null}
    </div>
  );
}
