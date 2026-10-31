import NextAuth from "next-auth";
import type { EmailConfig } from "next-auth/providers/email";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { brand } from "@/brand.config";
import { prisma } from "@/lib/db";
import authConfig from "@/lib/auth.config";
import { sendMagicLinkEmail } from "@/lib/mailer";
import {
  magicLinkPerEmailLimiter,
  magicLinkPerIpLimiter,
} from "@/lib/rate-limit";
import { checkLoginAttempt, ipFromRequest } from "@/lib/auth/login-throttle";
import { accountForLogin, findAccountsByEmail } from "@/lib/auth/account-email";
import {
  magicLinkUrlFor,
  openMagicLinkRequest,
  withMagicLinkAccountBinding,
} from "@/lib/auth/magic-link-account";
import { trustedClientIp } from "@/lib/trusted-client-ip";

// Pre-computed bcrypt-hash til timing-oracle-protection. Bruges som
// dummy-compare-target når brugeren ikke findes / ikke har password, så
// response-tid er ~konstant uanset email-eksistens. Hashen er for strengen
// "this is not a real password" — kan ALDRIG matche en rigtig kunde.
const DUMMY_PASSWORD_HASH =
  "$2b$10$3X9Q1aGcQq4dC9JZ5C4y4uYqVxJZW8nQ3K7P5kHGzZ2vMxN9wYbR2";

/**
 * "Sign in with GitHub" — opt-in, default-off. Enabled only when the
 * `githubAuth` feature flag is on AND both OAuth env keys are present. Exported
 * so the login UI can show/hide the button (a hidden button that 404s is worse
 * than no button). GitHub login creates/links a CUSTOMER user — admin stays a
 * DB role, never granted via OAuth.
 */
export const isGithubAuthEnabled =
  Boolean((brand.features as { githubAuth?: boolean }).githubAuth) &&
  Boolean(process.env.GITHUB_CLIENT_ID) &&
  Boolean(process.env.GITHUB_CLIENT_SECRET);

/**
 * "Continue with Google" — opt-in, default-off. Enabled only when the
 * `googleAuth` feature flag is on AND both OAuth env keys are present. Exported
 * so the login UI can show/hide the button (a hidden button that 404s is worse
 * than no button). Google login creates/links a CUSTOMER user — admin stays a
 * DB role, never granted via OAuth.
 */
export const isGoogleAuthEnabled =
  Boolean((brand.features as { googleAuth?: boolean }).googleAuth) &&
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // REG-EMAIL-CASE-c: a magic-link token is filed under the spelling its link
  // names (lib/auth/magic-link-account.ts).
  adapter: withMagicLinkAccountBinding(PrismaAdapter(prisma)),
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      from: brand.emails.from,
      maxAge: 15 * 60,
      async sendVerificationRequest({ identifier, url, expires, request }) {
        // REG-EMAIL-CASE-c: join the group the token Auth.js files next to this
        // call is paired with — first and synchronously, before that token can
        // be filed — and say when this request is done, sent or not, so a
        // token never waits on it (lib/auth/magic-link-account.ts).
        const link = openMagicLinkRequest(identifier, expires);
        try {
          // Per client IP as well as per address (MAGICLINK-IP-DEAD): one client
          // asking for links to many addresses is capped, not only one address
          // asked for many times. Same rule as sign-up (AUTH-REG1,
          // app/[locale]/account/actions.ts): trustedClientIp answers "unknown"
          // when the client cannot be identified (self-hosted without
          // CARTWRIGHT_TRUST_PROXY_IP_HEADERS), and one shared bucket would then
          // throttle every customer of the shop at once, so the per-IP limit
          // applies only to a known client. A throttled client is sent nothing,
          // but Auth.js answers it exactly as a sent link, so the answer does not
          // say the limit was hit; checked first, so it cannot drain an address's
          // own budget either. The drop is logged for the operator ("my link
          // never came"), without the address or the IP.
          const ip = trustedClientIp(request.headers);
          if (ip !== "unknown" && !magicLinkPerIpLimiter.check(ip).allowed) {
            console.warn(
              "[auth] Magic link not sent: this client asked for more links than the per-client limit allows (MAGICLINK-IP-DEAD).",
            );
            return;
          }

          const result = magicLinkPerEmailLimiter.check(identifier);
          if (!result.allowed) {
            throw new Error(
              "Too many magic link requests - wait a moment",
            );
          }

          // REG-EMAIL-CASE-c: past the limits, find the account this address
          // means and name its stored spelling in the link; the token Auth.js
          // files next to this call goes under the same spelling
          // (withMagicLinkAccountBinding). Several accounts differing only in
          // case, and none of them the one the rule picks: no link, logged
          // without the address — sending one would choose a customer for them.
          const target = await link.bind();
          if (!target) {
            console.warn(
              "[auth] Magic link not sent: several accounts hold this address in different cases and none of them is the one to sign in to (REG-EMAIL-CASE-c).",
            );
            return;
          }

          await sendMagicLinkEmail({
            email: target.identifier,
            url: magicLinkUrlFor(url, target.identifier),
          });
        } finally {
          link.close();
        }
      },
    } satisfies EmailConfig,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        // Brute-force throttle (parity-audit #3): cap attempts per-email AND
        // per-IP BEFORE doing any DB lookup or bcrypt work. When the bucket is
        // empty we deny without revealing whether the password was right — a
        // throttled attempt is indistinguishable from a wrong-password one to
        // the caller (both return null → generic CredentialsSignin). This also
        // means a flood can't be used as a timing oracle.
        const ip = ipFromRequest(request);
        const throttle = checkLoginAttempt({ email, ip });
        if (!throttle.allowed) {
          return null;
        }

        // Phase 4 anti-timing-oracle: bcrypt.compare tager ~100-200ms,
        // mens findUnique uden bcrypt tager ~5-50ms. Den forskel kan
        // angriber bruge til at enumerere registrerede emails. Vi kører
        // ALTID en bcrypt.compare — mod user.passwordHash hvis bruger
        // findes, ellers mod en pre-computed DUMMY_HASH så timingen er
        // konstant uanset om brugeren eksisterer.
        //
        // REG-EMAIL-CASE (lib/auth/account-email.ts): the account is found
        // whatever case is typed, against the rows as stored, so a row saved as
        // `Ada@Example.com` before sign-up lowercased signs in with
        // `ada@example.com` too. Of the rows that have a password, the one
        // spelled exactly as typed wins; several and none of them typed is
        // refused like a wrong password (accountForLogin says why).
        const user = accountForLogin(await findAccountsByEmail(email), email);

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
    // Optional "Continue with GitHub" — only registered when the flag + keys are
    // set, so the OAuth callback route never exists for shops that don't use it.
    ...(isGithubAuthEnabled
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    // Optional "Continue with Google" — only registered when the flag + keys are
    // set, so the OAuth callback route never exists for shops that don't use it.
    ...(isGoogleAuthEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
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
