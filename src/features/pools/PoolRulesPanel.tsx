"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { formatMinorToMajor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { memberLimitFor, type MemberLimitPeriod } from "@/src/core/pool-rules";
import type { BudgetPool } from "@/src/core/sync/types";

const field = "h-9 rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-sm";
const major = (minor: number | null) => (minor === null ? "" : formatMinorToMajor(minor));

/**
 * A pool's own rules: who approves its expenses when no workspace rule
 * does, what's small enough to approve on its own, and how much each
 * member can put through it. Everyone sees them; pool managers change them.
 */
export function PoolRulesPanel({ workspaceId, pool, currentUserId, baseCurrency }: { workspaceId: string; pool: BudgetPool; currentUserId: string; baseCurrency: string }) {
  const queryClient = useQueryClient();
  const canManage = useCan("pool.manage");
  const { money } = useMoneyFormat();
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const people = members.data?.members ?? [];
  const rules = pool.rules;
  const [approverIds, setApproverIds] = useState(rules.approverIds);
  const [autoUpTo, setAutoUpTo] = useState(major(rules.autoApproveUpToMinor));
  const [memberLimit, setMemberLimit] = useState(major(rules.memberLimitMinor));
  const [period, setPeriod] = useState<MemberLimitPeriod>(rules.memberLimitPeriod);
  const [overrides, setOverrides] = useState<Record<string, string>>(Object.fromEntries(rules.memberLimits.map((l) => [l.userId, major(l.limitMinor)])));

  const save = useMutation({
    mutationFn: () =>
      api.updatePoolRules(pool.id, {
        approverIds,
        autoApproveUpToMajor: autoUpTo.trim() || null,
        memberLimitMajor: memberLimit.trim() || null,
        memberLimits: Object.entries(overrides).filter(([, v]) => v.trim()).map(([userId, v]) => ({ userId, limitMajor: v.trim() })),
        memberLimitPeriod: period,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(qk.budgetPool(pool.id), { pool: result.pool });
      void queryClient.invalidateQueries({ queryKey: qk.budgetPools(workspaceId) });
    },
  });

  const nameOf = (id: string) => people.find((m) => m.userId === id)?.displayName ?? "Unknown";
  const myLimit = memberLimitFor(rules, currentUserId);
  const periodText = rules.memberLimitPeriod === "monthly" ? "a month" : "over the pool's life";

  return (
    <section aria-label="Pool rules" className="surface grain mt-6 space-y-3 rounded-[var(--r-lg)] p-4 text-sm">
      <h2 className="font-medium">Pool rules</h2>
      <ul className="space-y-1 text-xs text-[var(--muted-foreground)]">
        <li>Approved by: {rules.approverIds.length ? rules.approverIds.map(nameOf).join(" or ") : "any approver"} (unless a workspace approval rule says otherwise)</li>
        <li>{rules.autoApproveUpToMinor !== null ? `Approved on its own up to ${money(rules.autoApproveUpToMinor, baseCurrency)}, when no rule applies and nothing is flagged` : "Nothing is approved on its own"}</li>
        <li data-my-limit>{myLimit !== null ? `Your limit: ${money(myLimit, baseCurrency)} ${periodText}` : "No limit for you here"}</li>
      </ul>

      {canManage ? (
        <form
          aria-label="Edit pool rules"
          className="space-y-3 border-t border-[var(--hairline)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <legend className="mb-1 text-[var(--muted-foreground)]">Pool approvers (none ticked: any approver)</legend>
            {people.map((m) => (
              <label key={m.userId} className="flex items-center gap-1.5">
                <input type="checkbox" aria-label={`Approver: ${m.displayName}`} checked={approverIds.includes(m.userId)} onChange={() => setApproverIds(approverIds.includes(m.userId) ? approverIds.filter((x) => x !== m.userId) : [...approverIds, m.userId])} />
                {m.displayName}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-wrap items-center gap-2 text-xs">
            Approve on its own up to
            <input aria-label={`Auto-approve up to (${baseCurrency})`} inputMode="decimal" placeholder="off" value={autoUpTo} onChange={(e) => setAutoUpTo(e.target.value)} className={`${field} w-28`} />
            {baseCurrency}
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            Each member up to
            <input aria-label={`Member limit (${baseCurrency})`} inputMode="decimal" placeholder="no limit" value={memberLimit} onChange={(e) => setMemberLimit(e.target.value)} className={`${field} w-28`} />
            <select aria-label="Member limit period" value={period} onChange={(e) => setPeriod(e.target.value as MemberLimitPeriod)} className={field}>
              <option value="monthly">a month</option>
              <option value="pool">over the pool&apos;s life</option>
            </select>
          </div>
          <fieldset className="space-y-1 text-xs">
            <legend className="mb-1 text-[var(--muted-foreground)]">Limits for particular members (empty: the one above)</legend>
            {people.map((m) => (
              <label key={m.userId} className="flex items-center gap-2">
                <span className="w-40 truncate">{m.displayName}</span>
                <input aria-label={`Limit for ${m.displayName}`} inputMode="decimal" value={overrides[m.userId] ?? ""} onChange={(e) => setOverrides({ ...overrides, [m.userId]: e.target.value })} className={`${field} w-28`} />
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={save.isPending} className="h-10 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)]">
            Save pool rules
          </button>
          {save.error ? <p role="alert" className="text-sm text-[var(--balance-negative)]">{save.error.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
