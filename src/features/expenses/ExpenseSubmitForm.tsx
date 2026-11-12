"use client";

import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { submitExpenseBodySchema } from "@/src/core/schemas/ledger";
import { COMMON_CURRENCIES } from "@/src/core/money";
import { isoDate } from "@/src/core/budgets/period";
import { Button, PageContainer } from "@noirly-dev/ui";
import { Input, Label, Textarea } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";
import { categoryTree } from "@/src/core/categories";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";

type FormValues = {
  budgetPoolId: string;
  amountMajor: string;
  currency: string;
  categoryId: string;
  date: string;
  note: string;
  merchant: string;
  reimburse: boolean;
  /** "" for none; set to the submitter's own team once departments load. */
  departmentId: string;
  projectId: string;
};

type Props = {
  workspaceId: string;
  baseCurrency: string;
  defaultPoolId?: string;
};

export function ExpenseSubmitForm({
  workspaceId,
  baseCurrency,
  defaultPoolId = "",
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; key: string } | null>(null);

  const pools = useQuery({
    queryKey: qk.budgetPools(workspaceId),
    queryFn: () => api.listPools(workspaceId),
  });
  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
  });

  const form = useForm<FormValues>({
    defaultValues: {
      budgetPoolId: defaultPoolId,
      amountMajor: "",
      currency: baseCurrency,
      categoryId: "",
      date: isoDate(new Date()),
      note: "",
      merchant: "",
      reimburse: false,
      departmentId: "",
      projectId: "",
    },
  });

  const departments = useQuery({
    queryKey: ["transactions", workspaceId, "departments"],
    queryFn: () => api.listDepartments(workspaceId),
  });
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId) });
  // Their own team or department, unless they've already picked one.
  const defaultDepartmentId = departments.data?.defaultDepartmentId;
  useEffect(() => {
    if (defaultDepartmentId && !form.getFieldState("departmentId").isDirty) form.setValue("departmentId", defaultDepartmentId);
  }, [defaultDepartmentId, form]);
  const openDepartments = (departments.data?.departments ?? []).filter((d) => !d.archived);

  // What the spending policies say, as the expense is filled in (a moment after typing stops).
  const watched = useWatch({ control: form.control, name: ["budgetPoolId", "amountMajor", "currency", "date", "categoryId", "merchant"] });
  const [checkInput, setCheckInput] = useState<string | null>(null);
  const watchedKey = JSON.stringify([...watched, Boolean(receipt)]);
  useEffect(() => {
    const timer = setTimeout(() => setCheckInput(watchedKey), 400);
    return () => clearTimeout(timer);
  }, [watchedKey]);
  const policyCheck = useQuery({
    queryKey: ["approvals", workspaceId, "policy-check", checkInput],
    queryFn: () => {
      const [budgetPoolId, amountMajor, currency, date, categoryId, merchant, hasReceipt] = JSON.parse(checkInput!) as [string, string, string, string, string, string, boolean];
      return api.checkPolicies(workspaceId, { budgetPoolId, amountMajor: amountMajor.trim(), currency, date, categoryId: categoryId || null, merchant: merchant || null, hasReceipt });
    },
    enabled: (() => {
      if (!checkInput) return false;
      const [pool, amount] = JSON.parse(checkInput) as string[];
      return Boolean(pool) && /^\d+(\.\d{1,2})?$/.test((amount ?? "").trim());
    })(),
    staleTime: 30_000,
  });
  const violations = policyCheck.data?.violations ?? [];
  const late = policyCheck.data?.lateSubmission ?? null;
  const memberLimit = policyCheck.data?.memberLimit ?? null;
  const blocked = violations.some((v) => v.enforcement === "block") || late?.enforcement === "block" || Boolean(memberLimit?.over);
  const { money } = useMoneyFormat();

  // The <select> mounts before the pool options load, so the browser drops a
  // default it has no <option> for. Apply ?poolId= again once the pools arrive.
  const poolList = pools.data?.pools;
  useEffect(() => {
    if (!defaultPoolId || !poolList?.some((pool) => pool.id === defaultPoolId)) return;
    if (!form.getValues("budgetPoolId") || form.getValues("budgetPoolId") === defaultPoolId) {
      form.setValue("budgetPoolId", defaultPoolId);
    }
  }, [defaultPoolId, poolList, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = submitExpenseBodySchema.safeParse({
        budgetPoolId: values.budgetPoolId,
        amountMajor: values.amountMajor,
        currency: values.currency,
        categoryId: values.categoryId || null,
        date: values.date,
        note: values.note || null,
        receiptUrl: receipt?.url ?? null,
        receiptStorageKey: receipt?.key ?? null,
        reimburse: values.reimburse,
        merchant: values.merchant.trim() || null,
        departmentId: values.departmentId || null,
        projectId: values.projectId || null,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid expense");
      }
      return api.submitExpense(workspaceId, parsed.data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.approvals(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.budgetPools(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.notifications }),
      ]);
      router.push(`/w/${workspaceId}/expenses`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const saved = await api.uploadReceipt(workspaceId, file);
      setReceipt(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <PageContainer size="sm">
      <p className="font-mono text-[11px] tracking-[0.2em] text-[var(--accent)]">EXPENSE</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Submit expense</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Submitted spend waits for an approver before it hits the pool.
      </p>
      <form
        className="mt-6 space-y-3"
        onSubmit={form.handleSubmit((values) => {
          setError(null);
          mutation.mutate(values);
        })}
      >
        <div>
          <Label htmlFor="pool">Budget pool</Label>
          <Select id="pool" {...form.register("budgetPoolId")} required>
            <option value="">Select</option>
            {(pools.data?.pools ?? []).map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              {...form.register("amountMajor")}
              required
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select id="currency" {...form.register("currency")}>
              {COMMON_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" {...form.register("categoryId")}>
            <option value="">None</option>
            {categoryTree(categories.data?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </div>
        {openDepartments.length || projects.data?.projects.some((p) => !p.archived) ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="department">Department or team</Label>
              <Select id="department" {...form.register("departmentId")}>
                <option value="">None</option>
                {openDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.parentId ? `${openDepartments.find((p) => p.id === d.parentId)?.name ?? ""} › ${d.name}` : d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="project">Project</Label>
              <Select id="project" {...form.register("projectId")}>
                <option value="">None</option>
                {(projects.data?.projects ?? []).filter((p) => !p.archived).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
        <div>
          <Label htmlFor="merchant">Merchant</Label>
          <Input id="merchant" maxLength={120} placeholder="Where it was spent" {...form.register("merchant")} />
        </div>
        <div>
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...form.register("date")} required />
        </div>
        <div>
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" {...form.register("note")} />
        </div>
        <div>
          <Label htmlFor="receipt">Receipt</Label>
          <Input
            id="receipt"
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          {receipt ? (
            <p className="mt-1 font-mono text-[11px] text-[var(--balance-positive)]">Attached</p>
          ) : null}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" {...form.register("reimburse")} />
          <span>
            I paid for this myself — pay me back
            <span className="block text-xs text-[var(--muted-foreground)]">
              Once it&apos;s approved, it&apos;s owed to you until someone records paying you back.
            </span>
          </span>
        </label>
        {memberLimit ? (
          <p data-flag="member_limit" className={`rounded-md px-2 py-1 text-xs ${memberLimit.over ? "bg-[var(--balance-negative)]/15 text-[var(--balance-negative)]" : "bg-[var(--surface-2)] text-[var(--muted-foreground)]"}`}>
            {memberLimit.over
              ? `Can't submit — that's over your ${money(memberLimit.limitMinor, baseCurrency)} limit in this pool by ${money(memberLimit.overByMinor, baseCurrency)}`
              : `Your limit in this pool: ${money(Math.max(0, memberLimit.remainingMinor), baseCurrency)} of ${money(memberLimit.limitMinor, baseCurrency)} left ${memberLimit.period === "monthly" ? "this month" : ""}`}
          </p>
        ) : null}
        {late ? (
          <p data-flag="late_submission" className={`rounded-md px-2 py-1 text-xs ${late.enforcement === "block" ? "bg-[var(--balance-negative)]/15 text-[var(--balance-negative)]" : "bg-[var(--accent)]/10 text-[var(--accent)]"}`}>
            {late.enforcement === "block" ? "Can't submit — " : "Will be flagged — "}
            expenses from this date had to be in by {late.deadline}
          </p>
        ) : null}
        {violations.length ? (
          <ul aria-label="Policy warnings" className="space-y-1">
            {violations.map((v) => (
              <li key={`${v.policyId}-${v.kind}`} data-flag={v.kind} className={`rounded-md px-2 py-1 text-xs ${v.enforcement === "block" ? "bg-[var(--balance-negative)]/15 text-[var(--balance-negative)]" : "bg-[var(--accent)]/10 text-[var(--accent)]"}`}>
                {v.enforcement === "block" ? "Can't submit — " : "Will be flagged — "}{v.message}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="text-sm text-[var(--balance-negative)]" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={mutation.isPending || blocked}>
          {mutation.isPending ? "Submitting…" : "Submit for approval"}
        </Button>
      </form>
    </PageContainer>
  );
}
