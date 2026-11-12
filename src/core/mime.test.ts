import { describe, expect, it } from "vitest";
import { decodeWords, headerParams, htmlToText, parseAddresses, parseMail } from "./mime";

const pdfBytes = "%PDF-1.4 receipt";
const b64 = (text: string) => btoa(text);

const forwarded = [
  "From: \"Asha Rao\" <asha@example.com>",
  "To: r-abcdefgh12345678@in.ledger.example",
  "Subject: =?UTF-8?B?RndkOiBZb3VyIG9yZGVyIOKCuTQ1MA==?=",
  "Date: Fri, 30 Oct 2026 09:15:00 +0530",
  "Message-ID: <m1@example.com>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="outer"',
  "",
  "preamble",
  "--outer",
  'Content-Type: multipart/alternative; boundary="alt"',
  "",
  "--alt",
  "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "---------- Forwarded message ---------=",
  "",
  "From: Swiggy <noreply@swiggy.in>",
  "Total =E2=82=B9450.00",
  "--alt",
  "Content-Type: text/html",
  "",
  "<p>ignored when there is plain text</p>",
  "--alt--",
  "--outer",
  "Content-Type: application/octet-stream",
  "Content-Disposition: attachment; filename*=utf-8''Re%C3%A7u.pdf",
  "Content-Transfer-Encoding: base64",
  "",
  b64(pdfBytes),
  "--outer",
  "Content-Type: message/rfc822",
  "",
  "From: Shop <a@shop.example>",
  "Subject: inner",
  "Content-Type: image/png; name=\"inner.png\"",
  "Content-Transfer-Encoding: base64",
  "",
  b64("PNGDATA"),
  "--outer--",
  "",
].join("\r\n");

describe("MIME", () => {
  it("reads headers, text, nested parts and forwarded messages", () => {
    const mail = parseMail(forwarded);
    expect(mail.from).toEqual({ name: "Asha Rao", address: "asha@example.com" });
    expect(mail.recipients).toEqual(["r-abcdefgh12345678@in.ledger.example"]);
    expect(mail.subject).toBe("Fwd: Your order ₹450");
    expect(mail.date).toBe("2026-10-30");
    expect(mail.messageId).toBe("m1@example.com");
    expect(mail.text).toContain("Total ₹450.00");
    expect(mail.text).not.toContain("ignored");
    expect(mail.attachments.map((a) => [a.name, a.contentType])).toEqual([["Reçu.pdf", "application/pdf"], ["inner.png", "image/png"]]);
    expect(new TextDecoder().decode(mail.attachments[0]!.bytes)).toBe(pdfBytes);
  });

  it("falls back to HTML text", () => {
    const mail = parseMail(["From: a@b.c", "Content-Type: text/html", "", "<html><head><style>x{}</style></head><body><p>Total&nbsp;&#8377;99</p></body></html>"].join("\n"));
    expect(mail.text).toBe("Total ₹99");
    expect(htmlToText("a<br>b")).toBe("a\nb");
  });

  it("decodes words, params and address lists", () => {
    expect(decodeWords("=?ISO-8859-1?Q?Caf=E9_Bill?= =?UTF-8?B?IOKCuQ==?=")).toBe("Café Bill ₹");
    expect(headerParams('attachment; filename="a; b.pdf"; size=3')).toEqual({ value: "attachment", params: { filename: "a; b.pdf", size: "3" } });
    expect(headerParams("attachment; filename*0*=utf-8''Bi%20; filename*1=ll.pdf").params.filename).toBe("Bi ll.pdf");
    expect(parseAddresses('"Rao, Asha" <ASHA@Example.com>, bob@x.io, Bad')).toEqual([
      { name: "Rao, Asha", address: "asha@example.com" },
      { name: null, address: "bob@x.io" },
    ]);
  });
});
