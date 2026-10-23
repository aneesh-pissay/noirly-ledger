# Noirly Ledger — Roadmap

**Status:** Living checklist of what to build next, in order
**Companions:** [ARCHITECTURE.md](./ARCHITECTURE.md) (target design)

Each task is a checkbox. When a task ships, tick it and add the date:
`- [x] Accounts — done 2026-11-02`

Phases are ordered by dependency: most later work (net worth, reconciliation,
bills, debt planning, reports) needs the Phase 1 account model first.
Effort: **S** = days, **M** = 1–2 weeks, **L** = a month or more.

---

## Progress

| Phase | Done |
| --- | --- |
| 1. Accounts and the money model | 10 / 10 |
| 2. Budgeting | 4 / 9 |
| 3. Transactions and imports | 0 / 11 |
| 4. Bills, subscriptions, savings and debt | 0 / 13 |
| 5. Team expense management | 0 / 10 |
| 6. Reports and analytics | 0 / 9 |
| 7. Automations and integrations | 0 / 8 |
| 8. Security, privacy and audit | 0 / 7 |
| 9. Interface and platform | 0 / 9 |
| 10. AI (needs an Anthropic API key) | 0 / 10 |

---

## Already in Ledger

What the requirements list asks for that exists today (some only in part):

- Personal and team workspaces with a workspace switcher; roles owner, approver, member
- Expense, income and transfer transactions; one category each; a note; one receipt (private storage)
- Recurring transactions (daily, weekly, monthly, yearly, month-end days); deleted occurrences stay deleted
- Filters by date range, category, type and recurring; cursor paging
- Category budgets: weekly, monthly or custom periods, with a threshold alert (in-app notification)
- Team budget pools with a limit and live remaining balance (realtime); expense submission with receipts; one-step approve or reject, with a note; approvers can't approve their own when someone else can
- Savings goals with contributions and a target date
- Personal dashboard: spending by category, spending over time, net balance trend
- Reports with CSV and PDF export
- Multi-currency: a base currency per workspace and user-set FX rates by date (INR among the currencies)
- In-app notifications, Cmd+K command palette, Noirly dark and gold theme
- Account deletion and a privacy policy; the NoirlyLedger mobile app (separate repo)

---

## Phase 1 — Accounts and the money model

_Everything after this builds on accounts. Today a transaction belongs to a workspace, not an account._

- [x] Accounts: cash, bank, wallet, credit card and loan, with opening balance and currency (L) — done 2026-10-22
- [x] Account-to-account transfers that move money between accounts (M) — done 2026-10-22
- [x] Refund entries, linked to the expense they reverse (S) — done 2026-10-22
- [x] Pending, cleared and reconciled statuses (S) — done 2026-10-22
- [x] Assets, liabilities and net worth (needs accounts) (M) — done 2026-10-22
- [x] Available-to-spend and projected balances (upcoming recurring included) (M) — done 2026-10-22
- [x] Subcategories (S) — done 2026-10-22
- [x] Split one transaction across categories (M) — done 2026-10-22
- [x] Tags, merchants and projects on transactions (M) — done 2026-10-22
- [x] INR formatting with Indian numbering (lakh, crore), and the Indian financial year (April–March) or any fiscal start (S) — done 2026-10-22

## Phase 2 — Budgeting

_Needs Phase 1 subcategories and splits._

- [x] Yearly budget periods, alongside weekly, monthly and custom (S) — done 2026-10-23
- [x] Rollover and carry-forward of unspent (or overspent) amounts (M) — done 2026-10-23
- [x] Zero-based budgeting: give every rupee a job (M) — done 2026-10-23
- [x] Envelope budgeting on top of accounts (M) — done 2026-10-23
- [ ] Budget templates and automatic renewal each period (M)
- [ ] Real-time overspending warnings as you enter a transaction (S)
- [ ] Moving money between budgets, with revisions and version history (M)
- [ ] What-if scenarios and forecasts (L)
- [ ] Separate personal, household and business views (household and business as workspace kinds) (M)

## Phase 3 — Transactions and imports

- [ ] Search across notes, merchants and amounts, with saved views (M)
- [ ] Bulk create, edit and delete (M)
- [ ] Installment transactions (EMI purchases split over months) (M)
- [ ] Several attachments per transaction, comments, and a change history (M)
- [ ] UPI transaction reference field (S)
- [ ] GST and tax categories on transactions (M)
- [ ] CSV and XLSX statement import with preview, validation and rollback (L)
- [ ] Statement formats for major Indian banks (HDFC, ICICI, SBI, Axis, Kotak) (M)
- [ ] PDF statement import (text-based PDFs; scanned ones need OCR in Phase 10) (L)
- [ ] Duplicate transaction detection, on entry and on import (M)
- [ ] Bulk receipt upload, and matching receipts to transactions by amount and date (M)

## Phase 4 — Bills, subscriptions, savings and debt

_Needs Phase 1 accounts._

- [ ] Bill and subscription calendar from recurring items (M)
- [ ] Due-date reminders, plus renewal, cancellation and trial reminders (M)
- [ ] Scheduled payment records with due, paid and overdue statuses (M)
- [ ] Optional UPI payment deeplinks (upi://pay) to supported apps (S)
- [ ] Subscription detection from transactions (M)
- [ ] Price-increase alerts and duplicate or unused subscription insights (M)
- [ ] Bill-based cash-flow projection (M)
- [ ] Sinking funds for upcoming expenses (M)
- [ ] Goal milestones and forecasts (when you'll reach it at this pace) (S)
- [ ] Shared goals with family contributions (M)
- [ ] Loan and EMI repayment schedules (M)
- [ ] Debt snowball and avalanche plans, with interest and early-repayment simulation (L)
- [ ] Credit card balances, statement dates and payment reminders (M)

## Phase 5 — Team expense management

- [ ] Custom roles and permissions per workspace (M)
- [ ] Multi-level conditional approvals (by amount, category, pool) (L)
- [ ] Delegated approval while away, and a full approval audit history (M)
- [ ] Employee reimbursement requests and payout tracking (M)
- [ ] Category and merchant spending policies, receipt requirements and violation flags (M)
- [ ] Department, team and project budgets (M)
- [ ] Submission deadlines and escalation of late approvals (M)
- [ ] Pool approval rules and spending limits per member (M)
- [ ] Member contributions and allocations to pools (M)
- [ ] Pool templates: trip, household, event, team (S)

## Phase 6 — Reports and analytics

- [ ] Cash-flow and income-versus-expense reports (M)
- [ ] Category and merchant spending analysis (M)
- [ ] Budget-versus-actual comparisons (M)
- [ ] Monthly, quarterly and yearly trends (S)
- [ ] Net worth and debt progress reports (needs Phases 1 and 4) (M)
- [ ] Customizable dashboard widgets, and drill-down from any chart to its transactions (L)
- [ ] Scheduled PDF, CSV and XLSX exports by email (M)
- [ ] Anomaly, variance and savings analysis (rule-based; Phase 10 adds AI) (M)
- [ ] Automatic FX rates from a rates provider, for multi-currency travel (M)

## Phase 7 — Automations and integrations

- [ ] Category and merchant rules for incoming transactions (M)
- [ ] Trigger-condition-action workflows (L)
- [ ] Recurring budget and report automations (M)
- [ ] Configurable reminder and notification flows, with thresholds (M)
- [ ] Noirly Flow integration: bills and reminders as Flow tasks (M)
- [ ] Google Calendar: bills and due dates on a calendar (M)
- [ ] Email forwarding of receipts and bills to a workspace address (needs inbound email) (L)
- [ ] Developer API with personal access tokens, and webhooks (built on `@noirly-dev/webhooks`, like Flow) (M)

## Phase 8 — Security, privacy and audit

- [ ] Immutable financial activity audit history (M)
- [ ] Workspace isolation review and finer RBAC (S)
- [ ] Sensitive-data minimization and field encryption for account numbers and notes (M)
- [ ] Full data export (JSON) and scheduled backups, like Flow (M)
- [ ] Retention and deletion controls (S)
- [ ] Two-person approval for sensitive actions (deleting a workspace, changing approvers) (M)
- [ ] Reconciliation reports and backup restore (M)

## Phase 9 — Interface and platform

- [ ] Installable PWA with offline entry that syncs when back online (L)
- [ ] Keyboard shortcuts and quick-entry commands ("450 coffee yesterday") (M)
- [ ] Global search across transactions, budgets and pools (M)
- [ ] Workspace templates and an onboarding wizard (M)
- [ ] Custom notification settings and thresholds (S)
- [ ] Tablet layouts (S)
- [ ] Accessibility pass and localization (Hindi first) (M)
- [ ] Mobile app (`NoirlyLedger`) brought up to web parity (L)
- [ ] Update README (it still describes Phase 0) (S)

## Phase 10 — AI

_Build the Claude API layer once as a shared Noirly package (prompts, rate limits, cost tracking), as planned for Flow. Needs an Anthropic API key._

- [ ] Receipt OCR with field extraction (merchant, date, total, tax) (M)
- [ ] Line-item receipt scanning and itemization (M)
- [ ] AI-assisted merchant categorization, learning from corrections (M)
- [ ] Natural-language questions about spending ("what did I spend on food in March?") (M)
- [ ] Unusual spending and duplicate detection (M)
- [ ] AI-generated monthly financial summaries (S)
- [ ] Personalized savings recommendations (M)
- [ ] Income and cash-flow forecasting (L)
- [ ] Budget optimization and scenario planning (L)
- [ ] Explainable suggestions with approval before anything changes (M)

---

## Cross-app

- **Shared expense splitting lives in Noirly Split.** Equal, percentage, amount and weighted splits, who owes whom, simplified settlement suggestions and settlement history are what Split does. Ledger keeps shared *budgets* (pools, limits, contributions, approvals). To do: send a Ledger expense to a Split group, and record Split settlements as Ledger transactions (M).
- **Passkeys, multi-factor authentication and device sessions belong to Noirly Identity**, so every Noirly app gets them at once. Ledger shows a link to manage them.
- **Noirly Flow:** bills and reminders as Flow tasks (Phase 7).

## Not planned

| Item | Why |
| --- | --- |
| Bank-data providers (Plaid and similar) | Architecture non-goal; statement imports cover it first |
| Consent-based India account aggregation (AA) | Needs a licensed AA partner and registration as an FIU; revisit with a partner |
| Full double-entry accounting / general ledger | Architecture non-goal; Ledger is budgeting, not bookkeeping |
| Moving money (payments from inside Ledger) | Ledger records payments; UPI deeplinks hand off to the user's payment app |
