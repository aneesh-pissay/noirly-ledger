"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { parseMajorToMinor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { useSettled } from "@/src/features/transactions/BudgetWarning";
import type { TransactionType } from "@/src/core/models/enums";

type Props = {
  workspaceId: string;
  /** The transaction as typed so far. */
  draft: { type: TransactionType; amountMajor: string; currency: string; date: string; accountId: string; merchant: string; note: string; upiRef: string };
  accountName: (id: string | null) => string;
};

const WHY = { upi: "same UPI reference", "same-day": "same amount, same day", nearby: "same amount, a few days apart" } as const;

/** Says, as a transaction is typed, if it looks like one already recorded; saving still works, as it may be a second payment. */
export function DuplicateWarning({ workspaceId, draft, accountName }: Props) {
  const { money } = useMoneyFormat();
  let readable = false;
  try {
    readable = parseMajorToMinor(draft.amountMajor.trim()) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.date);
  } catch {
    readable = false;
  }
  const settled = useSettled(
    JSON.stringify({
      type: draft.type,
      amountMajor: draft.amountMajor.trim(),
      currency: draft.currency,
      date: draft.date,
      accountId: draft.accountId || null,
      text: [draft.merchant, draft.note].map((t) => t.trim()).filter(Boolean).join(" "),
      upiRef: draft.upiRef.trim() || null,
    }),
  );
  const check = useQuery({
    queryKey: ["duplicate-check", workspaceId, settled],
    queryFn: () => api.checkDuplicates(workspaceId, JSON.parse(settled)),
    enabled: readable,
    staleTime: 10_000,
  });
  const matches = readable ? check.data?.matches ?? [] : [];
  if (!matches.length) return null;
  return (
    <div role="status" aria-label="Duplicate check" data-duplicate-warning className="rounded-[var(--r-md)] border border-[var(--hairline)] px-3 py-2 text-xs">
      <p className="font-medium">Looks already recorded{matches.length > 1 ? ` (${matches.length})` : ""}:</p>
      <ul className="mt-1 space-y-0.5 text-[var(--muted-foreground)]">
        {matches.map(({ transaction: t, reason }) => (
          <li key={t.id}>
            {t.date} · {[t.merchant, t.note].filter(Boolean).join(" · ") || "No note"} · {money(t.amountMinor, t.currency)}
            {t.accountId ? ` · ${accountName(t.accountId)}` : ""} <span className="italic">({WHY[reason]})</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[var(--muted-foreground)]">Save anyway if it&apos;s a separate payment.</p>
    </div>
  );
}
