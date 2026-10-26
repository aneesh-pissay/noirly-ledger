"use client";

import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { createTransactionBodySchema } from "@/src/core/schemas/ledger";
import { COMMON_CURRENCIES, formatMinorToMajor, parseMajorToMinor } from "@/src/core/money";
import { isoDate } from "@/src/core/budgets/period";
import { Button, Dialog } from "@noirly-dev/ui";
import { Input, Label, Textarea } from "@noirly-dev/ui";
import { Select } from "@/src/components/Select";
import { useUIStore } from "@/src/stores/ui-store";
import { categoryTree } from "@/src/core/categories";
import { parseTagInput } from "@/src/core/labels";
import { BudgetWarning } from "@/src/features/transactions/BudgetWarning";
import { DuplicateWarning } from "@/src/features/transactions/DuplicateWarning";
import { GST_RATES, GST_SUPPLIES, GST_SUPPLY_LABEL, GST_TREATMENTS, GST_TREATMENT_LABEL, gstAmounts, type GstSupply, type GstTreatment } from "@/src/core/gst";

const NO_GST = { gstOn: false, gstRate: "18", gstTreatment: "taxable" as GstTreatment, gstSupply: "intra" as GstSupply, gstin: "", hsn: "", itc: false };

type FormValues = {
  type: "expense" | "income" | "transfer";
  amountMajor: string;
  currency: string;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  toAmountMajor: string;
  date: string;
  note: string;
  frequency: "" | "daily" | "weekly" | "monthly" | "yearly";
  clearing: "cleared" | "pending";
  merchant: string;
  /** Typed as "trip, work". */
  tags: string;
  projectId: string;
  upiRef: string;
  upiId: string;
  /** GST: on or off, and its settings as typed. */
  gstOn: boolean;
  gstRate: string;
  gstTreatment: GstTreatment;
  gstSupply: GstSupply;
  gstin: string;
  hsn: string;
  itc: boolean;
};

type Props = {
  workspaceId: string;
  baseCurrency: string;
};

export function TransactionComposer({ workspaceId, baseCurrency }: Props) {
  const open = useUIStore((s) => s.transactionComposerOpen);
  const setOpen = useUIStore((s) => s.setTransactionComposerOpen);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ url: string; key: string } | null>(null);
  // Split lines, when splitting across categories; null when it has one category.
  const [lines, setLines] = useState<Array<{ categoryId: string; amountMajor: string }> | null>(null);

  const categories = useQuery({
    queryKey: qk.categories(workspaceId),
    queryFn: () => api.listCategories(workspaceId),
    enabled: open,
  });

  const accounts = useQuery({
    queryKey: qk.accounts(workspaceId),
    queryFn: () => api.listAccounts(workspaceId),
    enabled: open,
  });
  const openAccounts = (accounts.data?.accounts ?? []).filter((account) => !account.archived);
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId), enabled: open });
  const openProjects = (projects.data?.projects ?? []).filter((project) => !project.archived);
  // Past merchants and tags, offered as suggestions while typing.
  const merchants = useQuery({ queryKey: qk.merchants(workspaceId), queryFn: () => api.listMerchants(workspaceId), enabled: open });
  const tags = useQuery({ queryKey: qk.tags(workspaceId), queryFn: () => api.listTags(workspaceId), enabled: open });

  const form = useForm<FormValues>({
    defaultValues: {
      type: "expense",
      amountMajor: "",
      currency: baseCurrency,
      categoryId: "",
      accountId: "",
      toAccountId: "",
      toAmountMajor: "",
      date: isoDate(new Date()),
      note: "",
      frequency: "",
      clearing: "cleared",
      merchant: "",
      tags: "",
      projectId: "",
      upiRef: "",
      upiId: "",
      ...NO_GST,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const transfer = values.type === "transfer";
      const splitting = Boolean(lines) && !transfer;
      const from = openAccounts.find((account) => account.id === values.accountId);
      const to = transfer ? openAccounts.find((account) => account.id === values.toAccountId) : undefined;
      const parsed = createTransactionBodySchema.safeParse({
        type: values.type,
        amountMajor: values.amountMajor,
        // The currency select is locked (and left out of the values) while an account is chosen.
        currency: openAccounts.find((account) => account.id === values.accountId)?.currency ?? values.currency,
        // A transfer moves money between your accounts; it isn't spending in a category.
        categoryId: transfer || splitting ? null : values.categoryId || null,
        splits: splitting ? lines!.map((line) => ({ categoryId: line.categoryId || null, amountMajor: line.amountMajor.trim() })) : null,
        accountId: values.accountId || null,
        toAccountId: to?.id ?? null,
        toAmountMajor: to && from && to.currency !== from.currency ? values.toAmountMajor : null,
        date: values.date,
        note: values.note || null,
        receiptUrl: receipt?.url ?? null,
        receiptStorageKey: receipt?.key ?? null,
        clearing: values.clearing,
        merchant: values.merchant.trim() || null,
        tags: parseTagInput(values.tags),
        projectId: values.projectId || null,
        upiRef: values.upiRef.trim() || null,
        gst: values.gstOn && values.type !== "transfer"
          ? {
              ratePct: values.gstTreatment === "taxable" ? Number(values.gstRate) : 0,
              treatment: values.gstTreatment,
              supply: values.gstSupply,
              gstin: values.gstin.trim() || null,
              hsn: values.hsn.trim() || null,
              itcEligible: values.itc,
            }
          : null,
        upiId: values.upiId.trim() || null,
        recurrence: values.frequency
          ? { frequency: values.frequency, interval: 1 }
          : null,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid transaction");
      }
      return api.createTransaction(workspaceId, parsed.data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.transactions(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: qk.budgets(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: qk.accounts(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: ["labels", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["duplicates", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["bills", workspaceId] }),
      ]);
      form.reset({
        type: "expense",
        amountMajor: "",
        currency: baseCurrency,
        categoryId: "",
        accountId: form.getValues("accountId"),
        toAccountId: "",
        toAmountMajor: "",
        date: isoDate(new Date()),
        note: "",
        frequency: "",
        clearing: "cleared",
        merchant: "",
        tags: "",
        projectId: "",
        upiRef: "",
        upiId: "",
        ...NO_GST,
      });
      setReceipt(null);
      setLines(null);
      setOpen(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const accountId = useWatch({ control: form.control, name: "accountId" });
  const chosenAccount = openAccounts.find((account) => account.id === accountId);
  const txType = useWatch({ control: form.control, name: "type" });
  const isTransfer = txType === "transfer";
  const amountMajor = useWatch({ control: form.control, name: "amountMajor" });
  const watchedCategory = useWatch({ control: form.control, name: "categoryId" });
  const gstOn = useWatch({ control: form.control, name: "gstOn" });
  const gstTreatment = useWatch({ control: form.control, name: "gstTreatment" });
  const gstRate = useWatch({ control: form.control, name: "gstRate" });
  const gstSupply = useWatch({ control: form.control, name: "gstSupply" });
  // The tax in what's being entered, worked out as it's typed.
  const gstLine = (() => {
    if (!gstOn) return "";
    let minor: number;
    try {
      minor = parseMajorToMinor(amountMajor.trim() || "0");
    } catch {
      return "";
    }
    const split = gstAmounts(minor, { ratePct: Number(gstRate), treatment: gstTreatment, supply: gstSupply });
    if (!split.taxMinor) return GST_TREATMENT_LABEL[gstTreatment];
    return gstSupply === "inter"
      ? `${formatMinorToMajor(split.taxableMinor)} + IGST ${formatMinorToMajor(split.igstMinor)}`
      : `${formatMinorToMajor(split.taxableMinor)} + CGST ${formatMinorToMajor(split.cgstMinor)} + SGST ${formatMinorToMajor(split.sgstMinor)}`;
  })();
  const watchedCurrency = useWatch({ control: form.control, name: "currency" });
  const watchedDate = useWatch({ control: form.control, name: "date" });
  const watchedMerchant = useWatch({ control: form.control, name: "merchant" });
  const watchedNote = useWatch({ control: form.control, name: "note" });
  const watchedUpiRef = useWatch({ control: form.control, name: "upiRef" });
  // What's left to give a line, so the split can be balanced before saving.
  const splitLeft = (() => {
    if (!lines) return "";
    const toMinor = (major: string) => {
      try {
        return major.trim() ? parseMajorToMinor(major.trim()) : 0;
      } catch {
        return null;
      }
    };
    const total = toMinor(amountMajor);
    const used = lines.reduce<number | null>((sum, line) => {
      const value = toMinor(line.amountMajor);
      return sum == null || value == null ? null : sum + value;
    }, 0);
    if (total == null || used == null) return "";
    const left = total - used;
    return left === 0 ? "Adds up" : left > 0 ? `${formatMinorToMajor(left)} left to split` : `${formatMinorToMajor(-left)} over`;
  })();
  const toAccountId = useWatch({ control: form.control, name: "toAccountId" });
  const toAccount = openAccounts.find((account) => account.id === toAccountId);
  const crossCurrency = Boolean(isTransfer && chosenAccount && toAccount && chosenAccount.currency !== toAccount.currency);

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
    <Dialog open={open} title="Add transaction" onClose={() => setOpen(false)}>
      <form
        className="space-y-3"
        onSubmit={form.handleSubmit((values) => {
          setError(null);
          mutation.mutate(values);
        })}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" {...form.register("type")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              className="font-mono tabular-nums"
              placeholder="0.00"
              {...form.register("amountMajor")}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="currency">Currency</Label>
            {/* An account's transactions are in its currency. */}
            <Select id="currency" disabled={Boolean(chosenAccount)} {...form.register("currency")}>
              {COMMON_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" className="font-mono" {...form.register("date")} />
          </div>
        </div>
        {openAccounts.length ? (
          <div className={isTransfer ? "grid grid-cols-2 gap-3" : undefined}>
          <div>
            <Label htmlFor="account">{isTransfer ? "From" : "Account"}</Label>
            <Select id="account" {...form.register("accountId", {
              onChange: (event) => {
                const account = openAccounts.find((a) => a.id === event.target.value);
                if (account) form.setValue("currency", account.currency);
              },
            })}>
              <option value="">No account</option>
              {openAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
              ))}
            </Select>
          </div>
          {isTransfer ? (
            <div>
              <Label htmlFor="to-account">To</Label>
              <Select id="to-account" {...form.register("toAccountId")}>
                <option value="">Choose an account</option>
                {openAccounts.filter((account) => account.id !== accountId).map((account) => (
                  <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>
                ))}
              </Select>
            </div>
          ) : null}
          </div>
        ) : null}
        {crossCurrency ? (
          <div>
            <Label htmlFor="to-amount">Amount received ({toAccount!.currency})</Label>
            <Input id="to-amount" inputMode="decimal" className="font-mono tabular-nums" placeholder="0.00" {...form.register("toAmountMajor")} />
          </div>
        ) : null}
        {isTransfer ? null : lines ? (
          <fieldset aria-label="Split" className="space-y-2 rounded-[var(--r-md)] border border-[var(--hairline)] p-3">
            <div className="flex items-baseline justify-between">
              <legend className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">Split across categories</legend>
              <button type="button" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setLines(null)}>
                Use one category
              </button>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                <Select
                  aria-label={`Line ${i + 1} category`}
                  value={line.categoryId}
                  onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, categoryId: e.target.value } : l)))}
                >
                  <option value="">Uncategorized</option>
                  {categoryTree(categories.data?.categories ?? []).map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </Select>
                <Input
                  aria-label={`Line ${i + 1} amount`}
                  inputMode="decimal"
                  className="font-mono tabular-nums"
                  placeholder="0.00"
                  value={line.amountMajor}
                  onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, amountMajor: e.target.value } : l)))}
                />
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  className="text-xs text-[var(--muted-foreground)] hover:text-[var(--balance-negative)] disabled:opacity-40"
                  disabled={lines.length <= 2}
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" className="text-xs underline" onClick={() => setLines([...lines, { categoryId: "", amountMajor: "" }])}>
                Add line
              </button>
              <p className="font-mono text-xs text-[var(--muted-foreground)]" aria-live="polite">{splitLeft}</p>
            </div>
          </fieldset>
        ) : (
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="category">Category</Label>
              <button
                type="button"
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                onClick={() => setLines([
                  { categoryId: form.getValues("categoryId"), amountMajor: form.getValues("amountMajor") },
                  { categoryId: "", amountMajor: "" },
                ])}
              >
                Split
              </button>
            </div>
            <Select id="category" {...form.register("categoryId", {
              // A category's default GST fills in the GST section, unless it's already been set here.
              onChange: (event) => {
                const chosen = categories.data?.categories.find((c) => c.id === event.target.value);
                if (chosen?.defaultGst && !form.getValues("gstOn")) {
                  form.setValue("gstOn", true);
                  form.setValue("gstRate", String(chosen.defaultGst.ratePct));
                  form.setValue("gstTreatment", chosen.defaultGst.treatment);
                  form.setValue("gstSupply", chosen.defaultGst.supply);
                  form.setValue("itc", Boolean(chosen.defaultGst.itcEligible));
                }
              },
            })}>
              <option value="">Uncategorized</option>
              {categoryTree(categories.data?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        {txType === "expense" ? (
          <BudgetWarning
            workspaceId={workspaceId}
            baseCurrency={baseCurrency}
            lines={
              lines
                ? lines.filter((line) => line.categoryId).map((line) => ({ categoryId: line.categoryId, amountMajor: line.amountMajor }))
                : watchedCategory
                  ? [{ categoryId: watchedCategory, amountMajor }]
                  : []
            }
            currency={chosenAccount?.currency ?? watchedCurrency}
            date={watchedDate}
            categoryName={(id) => categoryTree(categories.data?.categories ?? []).find((c) => c.id === id)?.label ?? "This category"}
          />
        ) : null}
        <div className={openProjects.length ? "grid grid-cols-2 gap-3" : undefined}>
          <div>
            <Label htmlFor="merchant">{txType === "income" ? "Paid by" : "Merchant"}</Label>
            <Input id="merchant" list="merchant-options" autoComplete="off" maxLength={80} {...form.register("merchant")} />
            <datalist id="merchant-options">
              {(merchants.data?.merchants ?? []).map((merchant) => <option key={merchant.key} value={merchant.name} />)}
            </datalist>
          </div>
          {openProjects.length ? (
            <div>
              <Label htmlFor="project">Project</Label>
              <Select id="project" {...form.register("projectId")}>
                <option value="">No project</option>
                {openProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </Select>
            </div>
          ) : null}
        </div>
        <div>
          <Label htmlFor="tags">Tags</Label>
          <Input id="tags" list="tag-options" autoComplete="off" placeholder="trip, work" {...form.register("tags")} />
          <datalist id="tag-options">
            {(tags.data?.tags ?? []).map((tag) => <option key={tag.tag} value={tag.tag} />)}
          </datalist>
        </div>
        {!isTransfer ? (
          <details className="group rounded-[var(--r-md)] border border-[var(--hairline)] px-3 py-2" open={gstOn || undefined}>
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted-foreground)]">GST{gstOn ? ` · ${gstLine}` : ""}</summary>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("gstOn")} />
              This amount includes GST
            </label>
            {gstOn ? (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="gst-treatment">Treatment</Label>
                  <Select id="gst-treatment" {...form.register("gstTreatment")}>
                    {GST_TREATMENTS.map((t) => <option key={t} value={t}>{GST_TREATMENT_LABEL[t]}</option>)}
                  </Select>
                </div>
                {gstTreatment === "taxable" ? (
                  <div>
                    <Label htmlFor="gst-rate">Rate</Label>
                    <Select id="gst-rate" {...form.register("gstRate")}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </Select>
                  </div>
                ) : <div />}
                <div>
                  <Label htmlFor="gst-supply">Supply</Label>
                  <Select id="gst-supply" {...form.register("gstSupply")}>
                    {GST_SUPPLIES.map((s) => <option key={s} value={s}>{GST_SUPPLY_LABEL[s]}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="gst-gstin">Supplier GSTIN (optional)</Label>
                  <Input id="gst-gstin" className="font-mono uppercase" maxLength={20} {...form.register("gstin")} />
                </div>
                <div>
                  <Label htmlFor="gst-hsn">HSN or SAC (optional)</Label>
                  <Input id="gst-hsn" inputMode="numeric" className="font-mono" maxLength={12} {...form.register("hsn")} />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" {...form.register("itc")} />
                  Can claim input tax credit
                </label>
              </div>
            ) : null}
          </details>
        ) : null}
        <details className="group rounded-[var(--r-md)] border border-[var(--hairline)] px-3 py-2">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted-foreground)]">UPI details</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="upi-ref">UPI reference</Label>
              <Input id="upi-ref" inputMode="numeric" className="font-mono" placeholder="12 digits" maxLength={20} {...form.register("upiRef")} />
            </div>
            <div>
              <Label htmlFor="upi-id">UPI ID</Label>
              <Input id="upi-id" autoComplete="off" placeholder="name@bank" maxLength={100} {...form.register("upiId")} />
            </div>
          </div>
        </details>
        <div>
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" {...form.register("note")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="frequency">Recurring</Label>
            <Select id="frequency" {...form.register("frequency")}>
              <option value="">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="clearing">Status</Label>
            <Select id="clearing" {...form.register("clearing")}>
              <option value="cleared">Cleared</option>
              <option value="pending">Pending</option>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="receipt">Receipt (optional)</Label>
          <Input
            id="receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
          {receipt ? (
            <p className="mt-1 font-mono text-[11px] text-[var(--balance-positive)]">Receipt attached</p>
          ) : null}
        </div>
        {open ? (
          <DuplicateWarning
            workspaceId={workspaceId}
            draft={{ type: txType, amountMajor, currency: chosenAccount?.currency ?? watchedCurrency, date: watchedDate, accountId, merchant: watchedMerchant, note: watchedNote, upiRef: watchedUpiRef }}
            accountName={(id) => openAccounts.find((account) => account.id === id)?.name ?? "an account"}
          />
        ) : null}
        {error ? <p className="text-sm text-[var(--balance-negative)]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
