import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@noirly-dev/ui";
import { BrandMark } from "@/src/components/BrandMark";
import { NoirlyLoginButton } from "@/src/features/auth/NoirlyLoginButton";
import { identityUrl } from "@/src/server/auth/identity-url";

export const metadata: Metadata = {
  title: "Sign in · Noirly Ledger",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only same-origin paths. `//evil.com` is a valid relative-protocol URL, so
  // the leading-slash check alone would be an open redirect.
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  return (
    <AuthShell
      logo={<BrandMark className="size-14 md:size-16" />}
      title="Sign in to Ledger"
      lead="Email, Google and verification are handled by Noirly Identity. No separate password to remember."
      footer={
        <>
          New here?{" "}
          <Link href="/" className="text-[var(--accent)] hover:underline">
            See what Ledger does
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <NoirlyLoginButton redirectTo={redirectTo} identityUrl={identityUrl()} />
        <p className="meta text-center">Opens Identity in a secure popup</p>
      </div>
    </AuthShell>
  );
}
