import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/src/components/LegalPage";
import { LEGAL } from "@/src/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy · Noirly Ledger",
  description: "What Noirly Ledger (web and Android) collects, why, who can see it, how long it is kept, and how to delete it.",
};

export default function LedgerPrivacyPage() {
  const contact = LEGAL.contactEmail;

  return (
    <LegalPage
      eyebrow={`Noirly Ledger · Effective ${LEGAL.effectiveDate}`}
      title="Privacy policy"
      lead={
        <p>
          This policy covers Noirly Ledger on the web ({LEGAL.webHost}) and the Noirly Ledger Android app (
          {LEGAL.androidPackage}): what it collects, why, who can see it, how long it is kept and how to delete it. In
          short: Ledger stores the money records you put in it, shows them only to you and the people you share a workspace
          with, never connects to your bank, never sells your data, and has no ads or trackers.
        </p>
      }
    >
      <LegalSection id="who" title="Who we are">
        <p>
          Noirly Ledger is run by {LEGAL.operator}, based in {LEGAL.country}, who is responsible for the data Ledger holds
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
        <p>
          You sign in to Ledger with a <strong>Noirly account</strong>, which is provided by Noirly Identity. Your account
          itself (email, name, password, Google sign-in and sign-in records) is covered by the{" "}
          <a href={LEGAL.identityPrivacyUrl}>Noirly Identity privacy policy</a>. This policy covers what Ledger itself keeps.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="What Ledger collects">
        <ul>
          <li>
            <strong>Your profile in Ledger:</strong> the name, email address and picture Noirly Identity shares with Ledger
            when you sign in, and your base currency.
          </li>
          <li>
            <strong>Your financial records:</strong> transactions you enter (amount, currency, type, category, date, notes and
            repeats), categories, budgets, savings goals, exchange rates you set, and receipt images you attach.
          </li>
          <li>
            <strong>Team information:</strong> workspace memberships and roles, invite links you create, shared budget pools,
            expenses submitted to them, and approval decisions with their review notes.
          </li>
          <li>
            <strong>Notifications:</strong> alerts Ledger creates for you, such as a budget nearing its limit, an expense
            waiting for approval or a decision on yours.
          </li>
          <li>
            <strong>Presence:</strong> while you have a budget pool or the approvals queue open, other members can see that you
            are viewing it. This is not stored after you leave.
          </li>
        </ul>
        <p>
          <strong>Ledger does not collect</strong> bank or card details, account numbers or credentials; it never connects
          to your bank, and every amount in it is one you entered. It does not collect your location, contacts, advertising
          IDs or usage analytics. The Android app asks only for internet access and contains no advertising, analytics or
          crash-reporting SDKs.
        </p>
      </LegalSection>

      <LegalSection id="use" title="How we use it">
        <ul>
          <li>To provide Ledger: store your records, keep them in sync across the web and your devices, and show them to you.</li>
          <li>To work out totals, budgets, reports and exports from your own records.</li>
          <li>
            To share a team workspace&apos;s records with its members, route expenses for approval, and send you the
            notifications above, in the app and, where email is enabled, by email.
          </li>
          <li>To keep the service secure and working, for example by checking that requests come from a signed-in member.</li>
        </ul>
        <p>We do not sell your data, use it for advertising, credit decisions or profiling, or build profiles of you.</p>
      </LegalSection>

      <LegalSection id="share" title="Who can see it, and who we share it with">
        <ul>
          <li>
            <strong>You:</strong> your personal workspace, with its transactions, budgets and goals, is visible only to you.
          </li>
          <li>
            <strong>Members of your team workspaces</strong> see that workspace&apos;s pools, expenses, receipts, approvals
            and reports, and your name and email. What each member can change depends on their role.
          </li>
          <li>
            <strong>Noirly Identity</strong> signs you in. Ledger asks it only to confirm who you are.
          </li>
          <li>
            <strong>Service providers</strong> that host Ledger&apos;s servers, database, receipt storage, email and
            live-update service for us and process data only on our instructions.
          </li>
          <li>
            <strong>Authorities</strong>, only if the law requires it.
          </li>
        </ul>
        <p>We do not share your data with anyone else.</p>
      </LegalSection>

      <LegalSection id="device" title="On your device">
        <p>
          On the web, Ledger uses strictly necessary cookies to keep you signed in and protect sign-in, and remembers your
          theme and last workspace in your browser. The Android app keeps its sign-in tokens in Android&apos;s encrypted
          keystore and remembers the last workspace you opened. Both are removed when you sign out or uninstall the app.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          All traffic between your device and Ledger is encrypted (HTTPS and secure WebSockets). Every request is checked
          against your Noirly sign-in and your role in the workspace before data is returned or changed, and receipts are
          only served to signed-in members.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <ul>
          <li>Your profile and records: for as long as you have a Noirly account, or until you delete them.</li>
          <li>Transactions you delete are hidden straight away and removed from totals.</li>
          <li>
            When your account is deleted, Ledger deletes your data straight away (see below). Copies in our hosting
            provider&apos;s backups are overwritten on their normal backup cycle.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="delete" title="Deleting your data">
        <p>You can delete your account and your Ledger data at any time:</p>
        <ul>
          <li>
            <strong>In the Android app:</strong> Settings → Delete account.
          </li>
          <li>
            <strong>On the web:</strong> <a href={LEGAL.deleteAccountUrl}>{LEGAL.deleteAccountUrl.replace("https://", "")}</a>.
          </li>
        </ul>
        <p>
          This deletes your Ledger profile, your personal workspace with all its records and receipts, team workspaces where
          you are the only member, and your notifications and invites. In team workspaces shared with others, expenses you
          submitted stay in the team&apos;s books (they belong to the workspace) but are no longer linked to you, and if you
          owned the workspace, ownership passes to another member. This cannot be undone.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="Your choices and rights">
        <p>
          You can see, change and delete your records in the app, export a workspace&apos;s records as CSV or PDF, and delete
          your account as described above. Depending on where you live (including under India&apos;s Digital Personal Data
          Protection Act, 2023), you may also have the right to request a copy of your data, to have it corrected or erased,
          and to complain to a data protection authority. To make a request, email <a href={`mailto:${contact}`}>{contact}</a>.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          Noirly Ledger is not meant for children under 13, and we do not knowingly collect their data. If you believe a child
          is using Ledger, contact us and we will delete their data.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          If we change this policy, we will update the date at the top of this page. For significant changes we will tell
          you in the app or by email before they take effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Questions about privacy in Noirly Ledger? Email <a href={`mailto:${contact}`}>{contact}</a>. For your Noirly
          account itself, see the <a href={LEGAL.identityPrivacyUrl}>Noirly Identity privacy policy</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
