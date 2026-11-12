import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@noirly-dev/ui";
import { auth } from "@/auth";
import { BrandMark } from "@/src/components/BrandMark";
import { MarketingHeader } from "@/src/components/MarketingHeader";
import { ARTICLES, CATEGORIES } from "@/src/docs/registry";
import { NoirlyLoginButton } from "@/src/features/auth/NoirlyLoginButton";
import { identityUrl } from "@/src/server/auth/identity-url";
import { ensureLedgerAccount } from "@/src/server/auth/bootstrap";

export const metadata: Metadata = {
  title: "Noirly Ledger",
  description:
    "Accounts, budgets, bills and goals for you, and shared pools with approvals for households and teams. Built for India: lakhs and crores, GST, UPI and an April financial year.",
};

type Feature = { title: string; copy: string };

const groups: Array<{ id: string; eyebrow: string; title: string; lede: string; features: Feature[] }> = [
  {
    id: "you",
    eyebrow: "Your money",
    title: "Know where it went, and where it's going",
    lede: "Accounts, budgets, bills and goals in one place, with a clear look ahead before the month gets away from you.",
    features: [
      { title: "Accounts and net worth", copy: "Cash, bank accounts, wallets, cards and loans, with balances that add up to your net worth and what's really yours to spend." },
      { title: "Budgets your way", copy: "Monthly, weekly or yearly caps, rollover of what's left, zero-based plans and envelopes. A warning before you overspend, not after." },
      { title: "Bank statements in minutes", copy: "Import CSV or Excel from HDFC, ICICI, SBI, Axis, Kotak and more. Preview every row, skip duplicates, undo the whole import." },
      { title: "Bills and subscriptions", copy: "One calendar of bills, EMIs and card dues, reminders before trials end, and subscriptions spotted in your spending." },
      { title: "Goals and debt", copy: "Savings goals with a forecast, sinking funds for big yearly bills, loan schedules and snowball or avalanche payoff plans." },
      { title: "Forecasts and what-ifs", copy: "Cash month by month at your usual pace, then try a raise, a new EMI or a big purchase before you commit." },
    ],
  },
  {
    id: "shared",
    eyebrow: "Shared money",
    title: "For households, trips and teams",
    lede: "Team workspaces with shared budget pools, approvals and payouts, so nobody has to ask what's left or who's owed.",
    features: [
      { title: "Shared pools", copy: "A trip, a flat or a project with a limit and a live balance everyone sees, from a template or from scratch." },
      { title: "Approvals", copy: "Expenses with receipts, approved in steps by amount, category or pool, with cover when an approver is away." },
      { title: "Reimbursements", copy: "What's owed to whom, and a record of every payout with its reference." },
      { title: "Policies and limits", copy: "Spending limits, receipt rules and allowed merchants, flagged or blocked as people submit." },
      { title: "Departments and projects", copy: "Budgets where the spending happens, with alerts before a team runs over." },
      { title: "Controls you can show", copy: "Custom roles, two-person approval for sensitive changes, and a sealed audit history of every change." },
    ],
  },
  {
    id: "india",
    eyebrow: "Made for India",
    title: "Rupees, GST and UPI, done properly",
    lede: "The details other trackers leave out.",
    features: [
      { title: "Lakhs and crores", copy: "Indian number grouping and an April–March financial year, or any start month you like." },
      { title: "GST", copy: "Treatment, rate and supply on each transaction, with CGST, SGST and IGST worked out and a GST report." },
      { title: "UPI", copy: "UPI references and IDs on transactions, and pay links that open Google Pay, PhonePe, Paytm or any UPI app." },
    ],
  },
  {
    id: "connects",
    eyebrow: "Automations and integrations",
    title: "Less typing, fewer surprises",
    lede: "Rules, workflows and integrations that keep Ledger up to date and tell the right people.",
    features: [
      { title: "Rules and workflows", copy: "Categorise transactions automatically, and act when a big expense lands or a budget hits its line." },
      { title: "Reports and exports", copy: "Cash flow, spending, budget vs actual, trends, net worth and insights, as PDF, CSV or Excel, emailed on a schedule." },
      { title: "Flow, calendar and email", copy: "Bills as Noirly Flow tasks and on Google Calendar; forward receipts and bills to your workspace's own address." },
    ],
  },
];

function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {features.map((item) => (
        <Card key={item.title} variant="interactive">
          <CardHeader>
            <CardTitle>{item.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="copy">{item.copy}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) {
    await ensureLedgerAccount({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    });
    redirect("/home");
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <MarketingHeader />

      <main id="main" className="flex flex-1 flex-col">
        <section className="shell section-y">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <BrandMark className="size-[4.25rem] md:size-20" />
            <p className="eyebrow mt-7">Personal &amp; shared finance</p>
            <h1 className="display-lg mt-4 text-balance">
              Every rupee accounted for, without the spreadsheet.
            </h1>
            <p className="lede mt-5 text-center">
              Accounts, budgets, bills and goals for you; shared pools, approvals and reports for your household or
              team. Ledger records your money, and never asks for your bank login.
            </p>

            <div className="mt-9 w-full max-w-xs">
              <NoirlyLoginButton redirectTo="/home" identityUrl={identityUrl()} />
            </div>
            <p className="meta mt-4">
              Opens Noirly Identity in a secure popup ·{" "}
              <Link href="/docs" className="underline-offset-4 hover:text-[var(--text)] hover:underline">
                Read the docs
              </Link>
            </p>
          </div>
        </section>

        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`${group.id}-title`} className="section-rule relative">
            <div className="shell section-y">
              <div className="mx-auto max-w-2xl text-center">
                <p className="eyebrow justify-center">{group.eyebrow}</p>
                <h2 id={`${group.id}-title`} className="display-md mt-4">{group.title}</h2>
                <p className="lede mt-5 text-center">{group.lede}</p>
              </div>
              <FeatureGrid features={group.features} />
            </div>
          </section>
        ))}

        <section aria-labelledby="docs-title" className="section-rule relative">
          <div className="shell section-y">
            <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
              <p className="eyebrow justify-center">Docs</p>
              <h2 id="docs-title" className="display-md mt-4">Every feature, explained</h2>
              <p className="lede mt-5 text-center">
                {ARTICLES.length} guides across {CATEGORIES.length} topics, from your first account to approval rules.
                Read them before you sign up.
              </p>
              <Link
                href="/docs"
                className="focusable mt-8 inline-flex min-h-11 items-center rounded-full border border-[var(--hairline)] px-5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
              >
                Browse the docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="section-rule relative">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-7">
          <span className="flex items-center gap-4 text-[var(--text)]">
            <span className="inline-flex size-[4.25rem] shrink-0 md:size-20">
              <BrandMark className="size-full" />
            </span>
            <span className="display-md">Noirly Ledger</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="meta">Budgets · Bills · Pools · Reports</span>
            <Link href="/docs" className="meta underline-offset-4 hover:text-[var(--text)] hover:underline">
              Docs
            </Link>
            <Link href="/privacy" className="meta underline-offset-4 hover:text-[var(--text)] hover:underline">
              Privacy policy
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
