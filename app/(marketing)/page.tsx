import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@noirly-dev/ui";
import { auth } from "@/auth";
import { BrandMark } from "@/src/components/BrandMark";
import { MarketingHeader } from "@/src/components/MarketingHeader";
import { NoirlyLoginButton } from "@/src/features/auth/NoirlyLoginButton";
import { ensureLedgerAccount } from "@/src/server/auth/bootstrap";

export const metadata: Metadata = {
  title: "Noirly Ledger",
  description:
    "Budgets, expenses, pools, and reports for personal and team finance in the Noirly ecosystem.",
};

const features = [
  {
    title: "Budgets",
    copy: "Set a cap per category and watch what is left of it, period by period.",
  },
  {
    title: "Expenses",
    copy: "Submit, approve and settle team spending without a spreadsheet in the middle.",
  },
  {
    title: "Pools",
    copy: "Shared budget pools with live meters, so nobody has to ask what is left.",
  },
  {
    title: "Reports",
    copy: "Summaries and exports for a personal ledger or a whole workspace.",
  },
  {
    title: "Noirly Identity",
    copy: "Email, Google and verification in one account. No new password to remember.",
  },
  {
    title: "Realtime",
    copy: "Pool balances and approvals update as they happen, on every open tab.",
  },
];

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
        {/* Hero */}
        <section className="shell section-y">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <BrandMark className="size-[4.25rem] md:size-20" />
            <p className="eyebrow mt-7">Personal &amp; team finance</p>
            <h1 className="display-lg mt-4 text-balance">
              Every rupee accounted for, without the spreadsheet.
            </h1>
            <p className="lede mt-5 text-center">
              Budgets, expenses, shared pools and reports in one ledger — for you alone
              or for the whole workspace.
            </p>

            <div className="mt-9 w-full max-w-xs">
              <NoirlyLoginButton redirectTo="/home" />
            </div>
            <p className="meta mt-4">Opens Noirly Identity in a secure popup</p>
          </div>
        </section>

        {/* Features */}
        <section className="section-rule relative">
          <div className="shell section-y">
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow justify-center">What is inside</p>
              <h2 className="display-md mt-4">Built for the way money actually moves</h2>
            </div>

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
          <span className="meta">Budgets · Expenses · Pools · Reports</span>
        </div>
      </footer>
    </div>
  );
}
