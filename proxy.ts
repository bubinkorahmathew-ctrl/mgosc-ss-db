import { NextResponse } from "next/server";
import { auth } from "@/lib/authn/next-auth";
import { sessionUser } from "@/lib/authn/session";
import { redirectFor } from "@/lib/authn/routes";

/**
 * Guards /admin, /teacher and /ovbs by role, and sends anyone with a temporary password to
 * /change-password first. The sign-in is checked against the database here, not only the
 * cookie: layouts don't re-run on navigation. Server actions and the data layer check again.
 */
export const proxy = auth(async (request) => {
  const user = await sessionUser(request.auth);
  const to = redirectFor(request.nextUrl.pathname,
    user && { role: user.profile.role, mustChangePassword: user.mustChangePassword });
  return to ? NextResponse.redirect(new URL(to, request.nextUrl)) : NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/ovbs/:path*", "/login", "/change-password"],
};
