import NextAuth from "next-auth";
import type { EmailConfig } from "next-auth/providers/email";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import authConfig from "@/lib/auth.config";
import { sendMagicLinkEmail } from "@/lib/mailer";
import { magicLinkPerEmailLimiter } from "@/lib/rate-limit";

// Pre-computed bcrypt-hash til timing-oracle-protection. Bruges som
// dummy-compare-target når brugeren ikke findes / ikke har password, så
// response-tid er ~konstant uanset email-eksistens. Hashen er for strengen
// "this is not a real password" — kan ALDRIG matche en rigtig kunde.
const DUMMY_PASSWORD_HASH =
  "$2b$10$3X9Q1aGcQq4dC9JZ5C4y4uYqVxJZW8nQ3K7P5kHGzZ2vMxN9wYbR2";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      from: brand.emails.from,
      maxAge: 15 * 60,
      async sendVerificationRequest({ identifier, url }) {
        const result = magicLinkPerEmailLimiter.check(identifier);
        if (!result.allowed) {
          throw new Error(
            "For mange magic-link-anmodninger — vent et øjeblik",
          );
        }

        await sendMagicLinkEmail({ email: identifier, url });
      },
    } satisfies EmailConfig,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        // Phase 4 anti-timing-oracle: bcrypt.compare tager ~100-200ms,
        // mens findUnique uden bcrypt tager ~5-50ms. Den forskel kan
        // angriber bruge til at enumerere registrerede emails. Vi kører
        // ALTID en bcrypt.compare — mod user.passwordHash hvis bruger
        // findes, ellers mod en pre-computed DUMMY_HASH så timingen er
        // konstant uanset om brugeren eksisterer.
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.passwordHash) {
          // Magic-link-only konti har ingen passwordHash — samme behandling
          // som "user findes ikke" for at undgå at lække konto-typen.
          await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (user?.id) {
        const { mergeGuestCartIntoUser } = await import("@/lib/cart");
        await mergeGuestCartIntoUser(user.id);
      }
    },
  },
});
