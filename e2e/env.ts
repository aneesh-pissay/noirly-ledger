/**
 * The environment the e2e server runs with. Values here win over `.env.local`
 * (Next only fills in variables that aren't already set, and an empty string
 * counts as set, which is how realtime and R2 are switched off).
 */
export const E2E_PORT = 3103;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const FAKE_FLOW_PORT = 3199;

/** Test-only secrets: the server trusts them, and the tests use them to sign in and run cron. */
export const E2E_AUTH_SECRET = "noirly-ledger-e2e-secret-not-for-production-use-0123456789";
export const E2E_CRON_SECRET = "noirly-ledger-e2e-cron-secret-not-for-production-0123";
export const E2E_INBOUND_SECRET = "noirly-ledger-e2e-inbound-secret-not-for-production-01";
export const E2E_INBOUND_DOMAIN = "in.ledger.e2e.invalid";

export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/noirly-ledger-e2e";

/** Auth.js cookie name under `next start` over http (no __Secure- prefix). */
export const SESSION_COOKIE = "authjs.session-token";

export const E2E_ENV: Record<string, string> = {
  NEXT_DIST_DIR: ".next-e2e",
  MONGODB_URI: E2E_MONGODB_URI,
  AUTH_SECRET: E2E_AUTH_SECRET,
  AUTH_URL: E2E_BASE_URL,
  NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
  // No live Identity: sessions are minted locally with the test secret.
  AUTH_NOIRLY_ISSUER: "https://identity.e2e.invalid",
  NEXT_PUBLIC_IDENTITY_URL: "https://identity.e2e.invalid",
  AUTH_NOIRLY_CLIENT_ID: "noirly-ledger-e2e",
  AUTH_NOIRLY_CLIENT_SECRET: "noirly-ledger-e2e",
  CRON_SECRET: E2E_CRON_SECRET,
  // Email goes through nodemailer's JSON transport: "sent", but nothing leaves the machine.
  SMTP_URL: "json",
  // Exchange rates from a set table: tests never go online.
  FX_RATES_URL: "fixed",
  // Emailed receipts: the tests post raw messages to /api/inbound-email as the relay would.
  INBOUND_EMAIL_DOMAIN: E2E_INBOUND_DOMAIN,
  INBOUND_EMAIL_SECRET: E2E_INBOUND_SECRET,
  // Webhooks may go to the receiver the webhook tests run on localhost.
  LEDGER_WEBHOOKS_ALLOW_LOCALHOST: "1",
  // A stand-in Flow the Flow tests start (e2e/fake-flow.ts); nothing else calls it.
  NOIRLY_FLOW_URL: `http://127.0.0.1:${FAKE_FLOW_PORT}`,
  // Realtime off: no WebSocket from the browser, no publishes from the server.
  NEXT_PUBLIC_REALTIME_WS_URL: "",
  REALTIME_INTERNAL_URL: "",
  // Receipts go to the local data folder, never a real bucket.
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET_NAME: "",
  R2_PUBLIC_URL: "",
};
