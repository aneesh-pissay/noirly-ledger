"use client";

import { useState } from "react";
import { Input, Label } from "@noirly-dev/ui";
import { simulatePrepayment } from "@/src/core/debts";
import type { LoanView } from "@/src/core/loans";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { Select } from "@/src/components/Select";

function minorOf(text: string) {
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function duration(months: number) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} year${years === 1 ? "" : "s"}` : null, rest ? `${rest} month${rest === 1 ? "" : "s"}` : null].filter(Boolean).join(" ") || "no time";
}

/** What prepaying a loan would do: a lump sum and/or extra each month, finishing sooner or paying a smaller EMI. */
export function PrepayWhatIf({ loan }: { loan: LoanView }) {
  const { money } = useMoneyFormat();
  const [lump, setLump] = useState("");
  const [extra, setExtra] = useState("");
  const [mode, setMode] = useState<"tenure" | "emi">("tenure");
  const s = loan.summary;
  if (!s.monthsLeft) return null;
  const result = simulatePrepayment(
    { balanceMinor: s.principalLeftMinor, annualRatePct: loan.annualRatePct, emiMinor: s.emiMinor, monthsLeft: s.monthsLeft },
    { lumpSumMinor: minorOf(lump), atMonth: 1, extraMonthlyMinor: minorOf(extra), mode },
  );
  const trying = minorOf(lump) > 0 || minorOf(extra) > 0;

  return (
    <div data-prepay className="space-y-3 rounded-lg border border-[var(--hairline)] p-3 text-xs">
      <p className="text-sm font-medium">What if I prepay?</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`lump-${loan.id}`}>Lump sum with the next EMI</Label>
          <Input id={`lump-${loan.id}`} inputMode="decimal" placeholder="0.00" value={lump} onChange={(e) => setLump(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`extra-${loan.id}`}>Extra every month</Label>
          <Input id={`extra-${loan.id}`} inputMode="decimal" placeholder="0.00" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`mode-${loan.id}`}>After a lump sum</Label>
          <Select id={`mode-${loan.id}`} value={mode} onChange={(e) => setMode(e.target.value as "tenure" | "emi")}>
            <option value="tenure">Keep the EMI, finish sooner</option>
            <option value="emi">Keep the end date, lower the EMI</option>
          </Select>
        </div>
      </div>
      <p data-prepay-result className="text-sm">
        {!trying
          ? `As it stands: ${duration(result.before.months)} to go and ${money(result.before.interestMinor, loan.currency)} of interest still to pay.`
          : `${
              result.savedMonths > 0
                ? `Done in ${duration(result.after.months)} instead of ${duration(result.before.months)}, ${duration(result.savedMonths)} sooner`
                : `Still done in ${duration(result.after.months)}`
            }${mode === "emi" && minorOf(lump) > 0 && result.after.emiMinor !== s.emiMinor ? `, with the EMI down to ${money(result.after.emiMinor, loan.currency)}` : ""}. Saves ${money(result.savedInterestMinor, loan.currency)} of interest.`}
      </p>
      <p className="text-[var(--muted-foreground)]">Lenders may charge for prepaying, though not on floating-rate home loans in India. It&apos;s a what-if: nothing is changed.</p>
    </div>
  );
}
