import { describe, expect, it } from "vitest";
import { addressedLocalPart, billName, forwardedFrom, guessBill, guessFromEmail, readDate, receiptFiles } from "./inbound-email";

describe("inbound email", () => {
  it("finds the workspace address among the recipients", () => {
    const local = "r-abcdefgh12345678";
    expect(addressedLocalPart(["me@gmail.com", `${local}+oct@In.Ledger.example`.toLowerCase()], "in.ledger.example")).toBe(local);
    expect(addressedLocalPart(["r-short@in.ledger.example", `${local}@other.example`], "in.ledger.example")).toBeNull();
  });

  it("reads dates only when their order is certain", () => {
    expect(readDate("2026-11-12")).toBe("2026-11-12");
    expect(readDate("12 Nov 2026")).toBe("2026-11-12");
    expect(readDate("November 12, 2026")).toBe("2026-11-12");
    expect(readDate("12/11/2026")).toBeNull();
    expect(readDate("31 Feb 2026")).toBeNull();
  });

  it("guesses a forwarded receipt's shop, total and date", () => {
    const text = "---------- Forwarded message ---------\nFrom: Swiggy <noreply@swiggy.in>\nDate: Thu, 29 Oct 2026 at 21:04\nSubject: Your order\n\nItem total ₹400.00\nDelivery ₹50\nGrand Total: ₹450.00";
    expect(forwardedFrom(text)).toEqual({ name: "Swiggy", address: "noreply@swiggy.in" });
    expect(guessFromEmail({ from: { name: "Asha", address: "asha@example.com" }, subject: "Fwd: Your order", date: "2026-10-30", text }, true)).toEqual({ date: "2026-10-29", amountMinor: 45_000, currency: "INR", merchant: "Swiggy" });
  });

  it("uses the sender when it's the shop writing, and its domain when it has no name", () => {
    const mail = { from: { name: null, address: "receipts@mail.uber.com" }, subject: "Your trip", date: "2026-10-30", text: "Total $12.40" };
    expect(guessFromEmail(mail, false)).toEqual({ date: "2026-10-30", amountMinor: 1_240, currency: "USD", merchant: "Uber" });
    expect(guessFromEmail(mail, true).merchant).toBeNull();
  });

  it("spots a bill: an amount due and a due date", () => {
    const text = "Dear customer,\nYour electricity bill for October is ready.\nAmount payable: Rs. 1,840.00\nDue date: 12 Nov 2026";
    expect(guessBill({ subject: "Bill for October", text })).toEqual({ dueDate: "2026-11-12", amountMinor: 184_000, currency: "INR" });
    expect(guessBill({ subject: "Receipt", text: "Total ₹450.00" })).toBeNull();
    expect(guessBill({ subject: "Due", text: "Pay by November 3, 2026" })).toBeNull();
    expect(billName({ from: { name: "BESCOM Billing", address: "bills@bescom.in" }, subject: "Bill", text }, false)).toBe("BESCOM");
    expect(billName({ from: { name: "Asha", address: "a@x.io" }, subject: "Fwd: Water bill", text: "no sender here" }, true)).toBe("Water bill");
  });

  it("keeps receipt files only", () => {
    const file = (name: string, contentType: string, size: number) => ({ name, contentType, bytes: new Uint8Array(size) });
    expect(receiptFiles([file("a.pdf", "application/pdf", 100), file("logo.png", "image/png", 900), file("photo.jpg", "image/jpeg", 50_000), file("x.zip", "application/zip", 5000), file("huge.pdf", "application/pdf", 9 * 1024 * 1024)]).map((f) => f.name)).toEqual(["a.pdf", "photo.jpg"]);
  });
});
