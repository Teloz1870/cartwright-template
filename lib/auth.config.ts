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
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/konto/login" },
  callbacks: {
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
