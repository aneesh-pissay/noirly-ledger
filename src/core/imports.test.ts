import { describe, expect, it } from "vitest";
import { guessDateFormat, guessMapping, mapRows, parseCsv, parseStatementAmount, parseStatementDate } from "@/src/core/imports";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, line endings and blank lines", () => {
    expect(parseCsv('﻿Date,Narration,Amount\r\n01/10/2026,"Swiggy, order ""123""",-450.00\n\n02/10/2026,Salary,50000\n')).toEqual([
      ["Date", "Narration", "Amount"],
      ["01/10/2026", 'Swiggy, order "123"', "-450.00"],
      ["02/10/2026", "Salary", "50000"],
    ]);
  });

  it("finds semicolons and tabs as separators", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parsing statement values", () => {
  it("reads dates in the order given, with month names and spreadsheet numbers", () => {
    expect(parseStatementDate("05/10/2026", "DMY")).toBe("2026-10-05");
    expect(parseStatementDate("10/05/2026", "MDY")).toBe("2026-10-05");
    expect(parseStatementDate("2026-10-05", "YMD")).toBe("2026-10-05");
    expect(parseStatementDate("05-Oct-2026", "DMY")).toBe("2026-10-05");
    expect(parseStatementDate("Oct 5, 2026", "DMY")).toBe("2026-10-05");
    expect(parseStatementDate("05/10/26", "DMY")).toBe("2026-10-05");
    expect(parseStatementDate("05/10/2026 14:32:01", "DMY")).toBe("2026-10-05");
    expect(parseStatementDate("46300", "DMY")).toBe("2026-10-05");
    expect(parseStatementDate("31/02/2026", "DMY")).toBeNull();
    expect(parseStatementDate("soon", "DMY")).toBeNull();
    expect(guessDateFormat(["03/04/2026", "10/25/2026"])).toBe("MDY");
    expect(guessDateFormat(["03/04/2026", "25/10/2026"])).toBe("DMY");
  });

  it("reads amounts with commas, symbols, brackets and Dr/Cr", () => {
    expect(parseStatementAmount("1,23,456.70")).toBe(12_345_670);
    expect(parseStatementAmount("₹ 450")).toBe(45_000);
    expect(parseStatementAmount("(12.50)")).toBe(-1_250);
    expect(parseStatementAmount("500.00 Dr")).toBe(-50_000);
    expect(parseStatementAmount("500.00Cr")).toBe(50_000);
    expect(parseStatementAmount("-3.456")).toBe(-345);
    expect(parseStatementAmount("")).toBeNull();
    expect(parseStatementAmount("abc")).toBeNull();
  });
});

describe("mapping a statement", () => {
  // Like an HDFC export: account details first, then debit and credit columns.
  const hdfc = parseCsv([
    "Account Statement,,,,,",
    "Account No: XXXX1234,,,,,",
    "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    "01/10/26,UPI-SWIGGY-swiggy@icici,428512345678,01/10/26,450.00,,10550.00",
    "02/10/26,NEFT CR-ACME PAYROLL,N123,02/10/26,,50000.00,60550.00",
    "03/10/26,Bad row,,03/10/26,,,",
    "35/10/26,Bad date,,,10.00,,",
  ].join("\n"));

  it("finds the header row and guesses the columns", () => {
    expect(guessMapping(hdfc)).toEqual({ headerRow: 2, date: 0, description: 1, amount: null, drCr: null, debit: 4, credit: 5, reference: 2, dateFormat: "DMY" });
  });

  it("reads each row with what's wrong with it", () => {
    const rows = mapRows(hdfc, guessMapping(hdfc));
    expect(rows[0]).toEqual({ line: 4, date: "2026-10-01", description: "UPI-SWIGGY-swiggy@icici", amountMinor: -45_000, reference: "428512345678", error: null });
    expect(rows[1]).toMatchObject({ amountMinor: 5_000_000, error: null });
    expect(rows[2]).toMatchObject({ error: "No amount" });
    expect(rows[3]).toMatchObject({ error: 'Couldn\'t read the date "35/10/26"' });
  });

  it("uses a Dr/Cr column to sign one amount column", () => {
    const rows = parseCsv("Txn Date,Description,Amount,Dr/Cr\n2026-10-01,Fuel,1200.00,DR\n2026-10-02,Refund,200.00,CR");
    const mapping = guessMapping(rows);
    expect(mapping).toMatchObject({ amount: 2, drCr: 3, dateFormat: "YMD" });
    expect(mapRows(rows, mapping).map((r) => r.amountMinor)).toEqual([-120_000, 20_000]);
  });
});
