import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/db/client";
import { clientIp } from "@/lib/rate-limit";
import { signInSchema } from "@/lib/validation/auth";
import { checkLogin, SESSION_DAYS, type LoginFailure } from "./login";

/** Thrown out of authorize(); `code` says why ("invalid", "limited" or "inactive"). */
export class LoginRefused extends CredentialsSignin {
  constructor(code: LoginFailure) {
    super();
    this.code = code;
  }
}

export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not set (32+ characters)");
  return secret;
}

/**
 * Auth.js v5: email + password, kept in a signed and encrypted JWT cookie holding the user id,
 * the role and the time the password was typed. lib/auth.ts checks the database on every
 * request on top of this (active, password not changed since), so a deactivation or a reset
 * signs the person out at once.
 *
 * No /api/auth route is mounted: sign-in and sign-out are server actions (actions/auth.ts).
 */
export const { auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true, // Vercel sets the host headers
  session: { strategy: "jwt", maxAge: SESSION_DAYS * 86_400 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, remember: {} },
      async authorize(raw, request) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) throw new LoginRefused("invalid");
        const result = await checkLogin(getDb(), parsed.data.email, parsed.data.password,
          { device: clientIp(request.headers), secret: authSecret() });
        if (!result.ok) throw new LoginRefused(result.reason);
        const { id, email, role, authAt } = result.user;
        // "Remember me": anything but an explicit "false" keeps the usual 14 days
        return { id, email, role, authAt, remember: (raw as { remember?: unknown }).remember !== "false" };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // a fresh sign-in: keep only what is needed
        const { role, authAt, remember } = user as { role?: string; authAt?: number; remember?: boolean };
        return { sub: user.id, role, authAt, remember };
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: { ...session.user, id: token.sub ?? "", role: token.role as string | undefined },
        authAt: token.authAt as number | undefined,
        remember: token.remember as boolean | undefined,
      };
    },
  },
  logger: {
    // a wrong password is not a server error
    error(error) {
      if (error instanceof CredentialsSignin || error.cause instanceof CredentialsSignin) return;
      console.error("[auth]", error.name, error.message);
    },
  },
});
