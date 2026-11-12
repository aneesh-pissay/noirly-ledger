import { describe, expect, it } from "vitest";
import type { BillItem } from "@/src/core/bills";
import { billEvent, buildCalendar, escapeText, feedItems, foldLine, googleAddUrl, markerEvent } from "./calendar-feed";

const item = (over: Partial<BillItem>): BillItem => ({
  id: "p1",
  date: "2026-11-30",
  merchant: "Rent, flat 4",
  note: null,
  amountMinor: 2_500_000,
  currency: "INR",
  categoryId: null,
  accountId: null,
  source: "payment",
  status: "upcoming",
  transactionId: null,
  ruleId: null,
  frequency: null,
  ...over,
});
const money = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`;

describe("calendar feed", () => {
  it("words events, marking paid and overdue bills", () => {
    expect(billEvent(item({}), money, "Home", "https://ledger.example/recurring")).toMatchObject({ uid: "payment:p1", date: "2026-11-30", summary: "Rent, flat 4 · 25000.00 INR" });
    expect(billEvent(item({ status: "paid" }), money, "Home", "u").summary).toBe("✓ Rent, flat 4 · 25000.00 INR");
    expect(billEvent(item({ status: "overdue" }), money, "Home", "u").description).toContain("Overdue, not paid yet");
    // A recurring charge keeps one event before and after it's recorded.
    expect(billEvent(item({ source: "recurring", ruleId: "r1", id: "t9" }), money, "Home", "u").uid).toBe("rule:r1:2026-11-30");
    expect(markerEvent({ date: "2026-12-02", kind: "trial", ruleId: "r2", name: "Spotify" }, "Home", "u")).toMatchObject({ uid: "trial:r2:2026-12-02", summary: "Free trial of Spotify ends" });
  });

  it("leaves out paid bills when asked, and all bills when they're off", () => {
    const items = [item({ id: "a" }), item({ id: "b", status: "paid" })];
    expect(feedItems(items, { bills: true, showPaid: true })).toHaveLength(2);
    expect(feedItems(items, { bills: true, showPaid: false }).map((i) => i.id)).toEqual(["a"]);
    expect(feedItems(items, { bills: false, showPaid: true })).toEqual([]);
  });

  it("builds an all-day RFC 5545 calendar, escaped and folded, each event once", () => {
    const event = billEvent(item({}), money, "Home", "https://ledger.example/recurring");
    const ics = buildCalendar({ name: "Ledger bills", host: "ledger.example", stamp: new Date("2026-10-31T10:00:00Z"), events: [event, event] });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("UID:payment:p1@ledger.example");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201");
    expect(ics).toContain("SUMMARY:Rent\\, flat 4 · 25000.00 INR");
    expect(ics).toContain("DTSTAMP:20261031T100000Z");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("escapes and folds per the spec", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const folded = foldLine(`DESCRIPTION:${"x".repeat(100)}`);
    expect(folded.split("\r\n ").join("")).toBe(`DESCRIPTION:${"x".repeat(100)}`);
  });

  it("links to Google's add dialog with a webcal address", () => {
    expect(googleAddUrl("https://ledger.example/api/calendar/abc.ics")).toBe("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fledger.example%2Fapi%2Fcalendar%2Fabc.ics");
  });
});
