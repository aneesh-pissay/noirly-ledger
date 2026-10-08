import NextAuth from "next-auth";
import { isSessionRevoked, revokeSessions } from "@/src/server/auth/revocation";

const issuer = process.env.AUTH_NOIRLY_ISSUER ?? "http://localhost:3000";
const clientId = process.env.AUTH_NOIRLY_CLIENT_ID;
const clientSecret = process.env.AUTH_NOIRLY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error(
    "AUTH_NOIRLY_CLIENT_ID and AUTH_NOIRLY_CLIENT_SECRET are required. Register a confidential client in Identity (npm run client:register), then paste the secret into noirly-ledger/.env.local.",
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    {
      id: "noirly",
      name: "Noirly",
      type: "oidc",
      issuer,
      clientId,
      clientSecret,
      checks: ["pkce", "state", "nonce"],
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
      authorization: {
        params: {
          scope: "openid profile email offline_access",
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: typeof profile.name === "string" ? profile.name : null,
          email: typeof profile.email === "string" ? profile.email : null,
          image: typeof profile.picture === "string" ? profile.picture : null,
        };
      },
    },
  ],
  events: {
    async signOut(message) {
      const identitySub = "token" in message ? message.token?.identitySub : undefined;
      if (typeof identitySub === "string" && identitySub) {
        await revokeSessions(identitySub);
      }
    },
  },
  callbacks: {
    async jwt({ token, user, profile, trigger }) {
      if (user?.id) {
        token.identitySub = user.id;
      }
      if (profile && "sub" in profile && typeof profile.sub === "string") {
        token.identitySub = profile.sub;
      }
      if (trigger === "signIn" || trigger === "signUp") {
        token.signedInAt = Date.now();
      }
      // Refuse sessions from before the user's last sign-out (see revocation.ts).
      // Sessions issued before this check existed carry no signedInAt and count as 0.
      if (typeof token.identitySub === "string" && token.identitySub) {
        const signedInAt = typeof token.signedInAt === "number" ? token.signedInAt : 0;
        if (await isSessionRevoked(token.identitySub, signedInAt)) return null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.identitySub ?? token.sub ?? "");
      }
      return session;
    },
  },
});
