# Emailed receipts and bills

Each workspace can have a forwarding address, `r-<16 letters and digits>@<INBOUND_EMAIL_DOMAIN>`, made and replaced under **Receipts → Email them in**. Mail sent to it by a member who can add expenses:

- puts its receipt files (PDF, JPEG, PNG, WebP; up to 10, 8 MB each) in the receipts inbox, with the date, total and shop guessed from the email (a forwarded email's original sender is the shop);
- turns an email that states both an amount due and a due date into a bill to pay (if the workspace leaves that on), unless the same amount is already due that day;
- tells the sender what came of it.

Mail from anyone else, or to an address that's been replaced or turned off, is logged on that page and dropped without a reply.

## Setting it up

Ledger doesn't receive mail itself. Point a domain's mail at a relay that POSTs each message, raw, to Ledger:

```
POST https://<ledger>/api/inbound-email?to=<envelope recipient>
Authorization: Bearer <INBOUND_EMAIL_SECRET>
Content-Type: message/rfc822

<the raw message>
```

`?to=` is optional; without it Ledger reads the message's To, Cc and delivery headers. Ledger answers 200 for anything it processed (taken or not) and 5xx when the relay should try again. Messages over 25 MB get a 413.

### Cloudflare Email Routing

Route the domain's catch-all to an Email Worker:

```js
export default {
  async email(message, env) {
    const res = await fetch(`${env.LEDGER_URL}/api/inbound-email?to=${encodeURIComponent(message.to)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.INBOUND_EMAIL_SECRET}`, "content-type": "message/rfc822" },
      body: message.raw,
    });
    if (res.status >= 500) throw new Error(`Ledger answered ${res.status}`);
  },
};
```

Other providers work the same way if they can forward the raw MIME message (Mailgun's "store and notify" with the MIME body, SendGrid Inbound Parse with "POST the raw, full MIME message", or a small relay of your own).
