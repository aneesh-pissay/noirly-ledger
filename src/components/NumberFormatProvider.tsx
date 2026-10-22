"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { formatGrouped, formatMoney, type NumberFormat } from "@/src/core/locale-format";

const NumberFormatContext = createContext<NumberFormat>("auto");

/** Shares the signed-in person's number format (lakh/crore or thousands) with everything that shows amounts. */
export function NumberFormatProvider({ value, children }: { value: NumberFormat; children: ReactNode }) {
  return <NumberFormatContext.Provider value={value}>{children}</NumberFormatContext.Provider>;
}

export function useNumberFormat() {
  return useContext(NumberFormatContext);
}

/**
 * Formatters for reading amounts in the person's chosen grouping:
 * `money(minor, "INR")` → "1,50,000.00 INR", `amount(minor, "INR")` → "1,50,000.00".
 * Inputs keep plain digits (formatMinorToMajor) so they parse back.
 */
export function useMoneyFormat() {
  const format = useNumberFormat();
  const money = useCallback((minor: number, currency: string) => formatMoney(minor, currency, format), [format]);
  const amount = useCallback((minor: number, currency: string) => formatGrouped(minor, currency, format), [format]);
  return { money, amount, format };
}
