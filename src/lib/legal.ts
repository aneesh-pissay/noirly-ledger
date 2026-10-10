/**
 * Facts Noirly Ledger's privacy policy states. Change them here, and bump
 * `effectiveDate` whenever the policy's substance changes.
 */
export const LEGAL = {
  /** Who runs Noirly Ledger and is responsible for its data. */
  operator: "Aneesh Pissay",
  country: "India",
  effectiveDate: "10 October 2026",
  webHost: "noirly.ledger.aneesh-pissay.in",
  androidPackage: "com.noirly.ledger",
  /** Noirly Identity, which holds the account (and has its own policy). */
  identityPrivacyUrl: "https://noirly.identity.aneesh-pissay.in/privacy",
  deleteAccountUrl: "https://noirly.identity.aneesh-pissay.in/delete-account",
  /** Where privacy requests go. PRIVACY_CONTACT_EMAIL overrides it. */
  contactEmail: process.env.PRIVACY_CONTACT_EMAIL || "contact@aneesh-pissay.in",
} as const;
