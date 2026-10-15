import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e builds go to their own folder (see playwright.config.ts).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  transpilePackages: [
    "@noirly-dev/realtime-client",
    "@noirly-dev/realtime-shared",
    "@noirly-dev/ui",
  ],
  serverExternalPackages: ["@react-pdf/renderer", "nodemailer"],
};

export default nextConfig;
