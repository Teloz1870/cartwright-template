import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration.
 *
 * This file MUST NOT import Prisma, bcryptjs, or any Node.js-only module
 * because it is loaded by middleware.ts which runs on the Edge runtime.
 *
 * The real Credentials provider (with DB-backed authorize) is added in
 * lib/auth.ts, which runs only in the Node.js runtime.
 */
const authConfig: NextAuthConfig = {
  // Trust the host header so self-hosted production (`next build && next start`,
  // Docker, any non-Vercel host) works out of the box. Without this, Auth.js v5
  // rejects every request with "UntrustedHost" and login is impossible when
  // self-hosting. Vercel auto-trusts already; this only changes the self-hosted
  // path. SECURITY: Auth.js uses the Host header to build callback URLs — pin the
  // canonical origin via the AUTH_URL env var in production (see .env.example) so
  // a spoofed Host header can't redirect auth flows. Spread into both the Node
  // server (lib/auth.ts) and the Edge middleware (proxy.ts).
  trustHost: true,
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/account/login" },
  callbacks: {
    authorized() {
      // Let the middleware body handle all authorization logic explicitly
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};

export default authConfig;
