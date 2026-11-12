# Noirly Ledger

Personal and shared finance for the Noirly ecosystem: accounts, budgets, bills and goals for individuals, and shared budget pools with approvals and reimbursements for households and teams. Built for India: lakh and crore numbering, an April–March financial year, GST and UPI.

Ledger records money; it never moves it or connects to a bank. Payments happen in your bank or UPI app, and Ledger records them, reminds you and reports on them.

## What's in it

- **Accounts and money:** cash, bank, wallet, credit card and loan accounts; transfers and refunds; pending, cleared and reconciled statuses; net worth; available-to-spend and projected balances; multi-currency with automatic exchange rates
- **Transactions:** splits, subcategories, tags, merchants and projects; search and saved views; bulk edit; files, comments and change history; CSV and XLSX statement import (HDFC, ICICI, SBI, Axis, Kotak, or any bank by columns) with undo; duplicate detection; a receipt inbox with matching
- **Budgets:** weekly, monthly, yearly and custom periods; rollover; zero-based plans; envelopes; templates; overspend warnings as you type; moving money between budgets with history; forecasts and what-if scenarios
- **Bills, goals and debt:** bill and subscription calendar; due-date, trial and cancel-by reminders; bills to pay with UPI links; subscription detection and price-rise alerts; cash flow ahead; savings goals with forecasts and shared pledges; sinking funds; EMI purchases; loans with prepayment what-ifs; snowball and avalanche payoff plans; credit card statements
- **Team workspaces:** Team, Household or Business; budget pools with live balances, templates, rules, member limits and contributions; expense submission with receipts; multi-step approval rules, away cover and deadlines; reimbursements and payouts; spending policies; departments and project budgets; custom roles; two-person approval for sensitive changes
- **Reports:** income vs expense, spending, budget vs actual, trends, cash flow, net worth and debt, insights; customizable dashboard with drill-down; PDF, CSV and XLSX exports, scheduled by email; GST summary
- **Automations and integrations:** transaction rules; trigger-condition-action workflows; scheduled automations (digest, budget refresh, sweep to a goal); per-topic notification settings; Noirly Flow tasks; Google Calendar feed; emailed receipts and bills; personal access tokens and signed webhooks
- **Security and data:** tamper-evident audit history; field encryption for account numbers and notes; JSON export, scheduled backups and restore; retention controls; workspace isolation checked on every request

The in-app **Docs** at `/docs` (public, no sign-in needed) explain every feature step by step. What's next is in **[docs/ROADMAP.md](./docs/ROADMAP.md)**.

## Stack

Next.js (App Router) and React, TypeScript, MongoDB with Mongoose, Auth.js signing in through [Noirly Identity](../noirly-identity) (OpenID Connect), TanStack Query, Tailwind with `@noirly-dev/ui`, `@noirly-dev/realtime-client` for live pool balances and approvals, and `@noirly-dev/webhooks` for outgoing webhooks. Receipts go to Cloudflare R2 (or `data/receipts` locally). Tests: Vitest and Playwright.

## Running it locally

You need Node 20+, pnpm, MongoDB, and Noirly Identity running on port 3000.

1. **Register Ledger with Identity** (a real confidential client, not `db:seed`):

   ```bash
   cd ../noirly-identity
   npm run client:register -- --client-id=noirly-ledger --name=NoirlyLedger --redirect-uri=http://localhost:3003/api/auth/callback/noirly
   ```

2. **Configure.** Copy the example and paste the printed `client_secret` into `AUTH_NOIRLY_CLIENT_SECRET`:

   ```bash
   cp .env.example .env.local
   ```

3. **Install.** The `@noirly-dev/*` packages come from GitHub Packages, so `GITHUB_TOKEN` must be set to a token that can read them (see `.npmrc`):

   ```bash
   pnpm install
   ```

4. **Run** at [http://localhost:3003](http://localhost:3003):

   ```bash
   pnpm dev
   ```

Realtime ([noirly-realtime](../noirly-realtime), port 4001), Noirly Flow, emailed receipts, SMTP and R2 are optional; each feature hides or falls back when its settings are unset.

## Configuration

`.env.example` lists every setting with a comment. The ones to know:

| Variable | What it does |
| --- | --- |
| `MONGODB_URI` | The database (same host as Identity, its own database name) |
| `AUTH_SECRET` | Auth.js session secret, 32+ characters |
| `AUTH_NOIRLY_ISSUER`, `AUTH_NOIRLY_CLIENT_ID`, `AUTH_NOIRLY_CLIENT_SECRET` | Noirly Identity and Ledger's client there |
| `LEDGER_SECRET_KEY` | Encrypts account numbers, notes and Flow tokens. Falls back to `AUTH_SECRET`. **Set it in production once and never change it**: data sealed under one key can't be read with another. Back it up with the database |
| `CRON_SECRET` | 32+ characters; protects the daily job below. Unset, the job answers 404 |
| `NOIRLY_FLOW_URL` | Noirly Flow, for bills as Flow tasks |
| `INBOUND_EMAIL_DOMAIN`, `INBOUND_EMAIL_SECRET` | Emailed receipts and bills ([docs/INBOUND-EMAIL.md](./docs/INBOUND-EMAIL.md)) |
| `SMTP_URL`, `SMTP_FROM` | Email for notifications, reminders and scheduled reports |
| `R2_*` | Receipt storage in Cloudflare R2 |
| `REALTIME_*`, `NEXT_PUBLIC_REALTIME_WS_URL` | Live updates through noirly-realtime |

## The daily job

Recurring transactions, reminders and everything scheduled run from one endpoint, `POST /api/cron/recurring`, authorized with `Bearer $CRON_SECRET`. Call it once a day (a Vercel cron, or any scheduler). Locally:

```bash
pnpm recurring:run
```

In order, it: fetches exchange rates, posts recurring transactions, sends bill and price-rise reminders, escalates late approvals, sends scheduled reports, runs automations, syncs Flow tasks, retries webhooks, encrypts notes saved before encryption, applies retention, and takes due backups.

## Tests and checks

```bash
pnpm test
```

Unit tests (Vitest), including the Docs content.

```bash
pnpm test:e2e
```

End-to-end tests (Playwright). They build and start an isolated server on port 3103 against the `noirly-ledger-e2e` database (wiped first), with test-only sessions and stand-ins for Identity, Flow and email, so they need MongoDB but not Identity. Set `E2E_MONGODB_URI` to use another database.

```bash
pnpm lint
```

```bash
pnpm docs:scan
```

Compares the code with the in-app Docs and lists what changed or isn't covered ([docs/DOCS-SYSTEM.md](./docs/DOCS-SYSTEM.md)).

## More

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): design, data models and layering
- [docs/API.md](./docs/API.md): the developer API, access tokens and webhooks
- [docs/INBOUND-EMAIL.md](./docs/INBOUND-EMAIL.md): setting up emailed receipts and bills
- [docs/DOCS-SYSTEM.md](./docs/DOCS-SYSTEM.md): how the in-app Docs work
- [docs/ROADMAP.md](./docs/ROADMAP.md): what's done and what's next

The NoirlyLedger Android app is a separate repository and uses the same API.
