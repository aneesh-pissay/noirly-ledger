import { describe, expect, it } from "vitest";
import { bankFormat, detectBankFormat, findBankFormat, headerKey } from "@/src/core/bank-formats";
import { mapRows, parseCsv } from "@/src/core/imports";

/** Each bank's export, first lines as they commonly come (shortened). */
const samples: Record<string, { csv: string; expect: Array<[string, number]> }> = {
  hdfc: {
    csv: [
      "HDFC BANK Ltd.,,,,,,",
      "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      "01/10/26,UPI-SWIGGY,428512345678,01/10/26,450.00,,10550.00",
      "02/10/26,SALARY,N1,02/10/26,,50000.00,60550.00",
    ].join("\n"),
    expect: [["2026-10-01", -45_000], ["2026-10-02", 5_000_000]],
  },
  icici: {
    csv: [
      "DETAILED STATEMENT,,,,,,,",
      "S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )",
      "1,05/10/2026,05/10/2026,-,UPI/ZOMATO/1234,\"1,250.00\",0.00,\"9,000.00\"",
      "2,06/10/2026,06/10/2026,-,NEFT-CREDIT,0.00,\"5,000.00\",\"14,000.00\"",
    ].join("\n"),
    expect: [["2026-10-05", -125_000], ["2026-10-06", 500_000]],
  },
  "icici-card": {
    csv: [
      "Date,Sr.No.,Transaction Details,Reward Point Header,Intl.Amount,Amount(in Rs),BillingAmountSign",
      "07/10/2026,1,AMAZON PAY,12,0,999.00,",
      "08/10/2026,2,PAYMENT RECEIVED,0,0,5000.00,CR",
    ].join("\n"),
    // Charges are money out; only the payment is marked CR.
    expect: [["2026-10-07", -99_900], ["2026-10-08", 500_000]],
  },
  sbi: {
    csv: [
      "Account Name :,MR RAVI KUMAR",
      "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance",
      "1 Oct 2026,1 Oct 2026,TO TRANSFER-UPI/DR/12345,TRANSFER TO 4897,300.00,,7700.00",
      "2 Oct 2026,2 Oct 2026,BY TRANSFER-NEFT,TRANSFER FROM 1234,,25000.00,32700.00",
    ].join("\n"),
    expect: [["2026-10-01", -30_000], ["2026-10-02", 2_500_000]],
  },
  axis: {
    csv: [
      "Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL",
      "03-10-2026,,UPI/P2M/BIGBASKET,812.40,,4187.60,1234",
      "04-10-2026,,IMPS/CREDIT,,1500.00,5687.60,1234",
    ].join("\n"),
    expect: [["2026-10-03", -81_240], ["2026-10-04", 150_000]],
  },
  kotak: {
    csv: [
      "Sl. No.,Transaction Date,Value Date,Description,Chq / Ref No.,Amount,Dr / Cr,Balance,Dr / Cr",
      "1,09/10/2026,09/10/2026,UPI/UBER,UPI-1,320.00,DR,6000.00,CR",
      "2,10/10/2026,10/10/2026,INTEREST,,12.30,CR,6012.30,CR",
    ].join("\n"),
    expect: [["2026-10-09", -32_000], ["2026-10-10", 1_230]],
  },
};

describe("bank statement formats", () => {
  it("compares headers by their letters and digits only", () => {
    expect(headerKey("Withdrawal Amt.")).toBe("withdrawalamt");
    expect(headerKey("Amount(in Rs)")).toBe("amountinrs");
  });

  for (const [id, sample] of Object.entries(samples)) {
    it(`recognises ${id} and reads its rows`, () => {
      const rows = parseCsv(sample.csv);
      const detected = detectBankFormat(rows);
      expect(detected?.format.id).toBe(id);
      const read = mapRows(rows, detected!.mapping).map((r) => [r.date, r.amountMinor]);
      expect(read).toEqual(sample.expect);
    });
  }

  it("maps a chosen bank onto the file, or says it doesn't fit", () => {
    expect(findBankFormat(parseCsv(samples.sbi!.csv), bankFormat("sbi")!)).toMatchObject({ headerRow: 1, date: 0, description: 2, debit: 4, credit: 5, reference: 3, bank: "sbi" });
    expect(findBankFormat(parseCsv(samples.sbi!.csv), bankFormat("axis")!)).toBeNull();
  });

  it("leaves other layouts to the guess", () => {
    expect(detectBankFormat(parseCsv("When,What,How much\n2026-10-01,Tea,4"))).toBeNull();
  });
});
