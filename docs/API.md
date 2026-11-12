# Ledger API

The same JSON API the web app uses, callable from scripts with a personal access token, and webhooks that tell your server when things change. Both work the way they do in Noirly Flow.

## Authentication

Make a token under **Settings → API tokens and webhooks**. It's shown once. Send it as a bearer token (`$LEDGER_URL` is the address you open Ledger at):

```bash
curl -H "Authorization: Bearer nlp_r_…" $LEDGER_URL/api/workspaces
```

- **Read only** tokens (`nlp_r_…`) can only make `GET` requests. Anything else gets `403 read_only_token`.
- **Read and write** tokens (`nlp_w_…`) can do what you can do in the app, in every workspace you're in, with your role there.
- Tokens expire after 30, 90 or 365 days, or never, as chosen when they're made. Revoke them in Settings at any time.
- A token can't manage tokens, add or change webhooks, link Noirly Flow, manage your calendar link or a workspace's email address, or delete your account. Those need you signed in.
- Bearer requests don't need the `X-Noirly-CSRF` header that browser requests send.

## Conventions

- JSON in and out. IDs are 24-character hex strings. Money is in minor units (`amountMinor`, paise or cents) with its `currency`; request bodies that take money use major units as a string (`amountMajor: "450.00"`).
- Dates are `YYYY-MM-DD`.
- Errors: `{ "error": "<code>", "message": "<readable>" }` with a matching status: `400 invalid_request`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 conflict`, `429 rate_limited` (with `Retry-After`).
- Rate limit: 300 requests a minute per address.

## Main endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/me` | You |
| GET | `/api/workspaces` | Workspaces you're in, with your role |
| GET, POST | `/api/workspaces/{workspaceId}/transactions` | List (query: `from`, `to`, `type`, `categoryId`, `accountId`, `q`, `cursor`) or add: `type`, `amountMajor`, `currency`, `date`, `categoryId`, `accountId`, `merchant`, `note`, `tags` |
| GET, PATCH, DELETE | `/api/transactions/{transactionId}` | |
| GET, POST | `/api/workspaces/{workspaceId}/categories` | |
| GET, POST | `/api/workspaces/{workspaceId}/accounts` | |
| GET, POST | `/api/workspaces/{workspaceId}/budgets` | `categoryId`, `period`, `limitMajor` |
| GET, POST | `/api/workspaces/{workspaceId}/payments` | Bills paid by hand; `POST /api/payments/{id}/pay` records one |
| GET, POST | `/api/workspaces/{workspaceId}/savings-goals` | `POST /api/savings-goals/{id}` adds to one |
| POST | `/api/workspaces/{workspaceId}/expenses` | Team workspaces: submit for approval |
| POST | `/api/approvals/{approvalId}/decide` | `{ decision: "approved" \| "rejected" }` |
| GET | `/api/workspaces/{workspaceId}/reports/{spending\|budgets\|trends\|insights\|net-worth}` | Query: `from`, `to`, `granularity` |
| GET | `/api/notifications` | |

## Webhooks

Workspace managers add webhooks under **Settings → API tokens and webhooks** (a personal workspace's owner manages it). Each event is a `POST` of `{ id, type, createdAt, data }`:

| Event | `data` |
| --- | --- |
| `transaction.created`, `transaction.updated` | The transaction |
| `transaction.deleted` | `{ id, workspaceId }` |
| `expense.submitted`, `expense.approved`, `expense.rejected` | `{ transaction, approval }` (team workspaces) |
| `budget.alert` | `{ budgetId, categoryId, categoryName, alertThresholdPct, spentMinor, availableMinor, currency }` |
| `ping` | From **Send test** |

Events come from changes made in Ledger or through the API; charges the recurring engine posts on its own don't send `transaction.created`.

Check `Noirly-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`) against your signing secret, reject timestamps more than 5 minutes off, and use `Noirly-Delivery` to skip repeats: retries send the same id. Answer with a 2xx within 10 seconds. `verifySignature` in `@noirly-dev/webhooks` does the check for you.

Failed deliveries are retried after 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours; a `410 Gone` stops them. After 15 deliveries in a row fail for good, the webhook turns itself off. URLs must be `https://` on a public address.

| Method | Path |
| --- | --- |
| GET, POST | `/api/workspaces/{workspaceId}/webhooks` (POST returns the secret once) |
| PATCH, DELETE | `/api/webhooks/{webhookId}` |
| POST | `/api/webhooks/{webhookId}/secret` (rotate) · `/test` |
| GET | `/api/webhooks/{webhookId}/deliveries` · POST `…/deliveries/{deliveryId}/redeliver` |

## Example: add an expense

```bash
curl -X POST $LEDGER_URL/api/workspaces/$WORKSPACE/transactions \
  -H "Authorization: Bearer $LEDGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"expense","amountMajor":"450.00","currency":"INR","date":"2026-10-31","merchant":"Swiggy"}'
```
