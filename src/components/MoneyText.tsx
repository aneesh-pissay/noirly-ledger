"use client";

import type { MoneyMinor } from "@/src/core/money";
import { useMoneyFormat } from "@/src/components/NumberFormatProvider";
import { cn } from "@/src/lib/cn";

type Props = {
  amountMinor: MoneyMinor;
  currency: string;
  tone?: "default" | "positive" | "negative";
  className?: string;
};

export function MoneyText({
  amountMinor,
  currency,
  tone = "default",
  className,
}: Props) {
  const { money } = useMoneyFormat();
  return (
    <span
      className={cn(
        "font-mono tabular-nums tracking-tight",
        tone === "positive" && "text-[var(--balance-positive)]",
        tone === "negative" && "text-[var(--balance-negative)]",
        className,
      )}
    >
      {money(amountMinor, currency)}
    </span>
  );
}
