import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/authn/cookie";
import { resolveSession } from "@/lib/authn/session";
import { getDatabase } from "@/lib/db";

/**
 * Guards /admin and /teacher by role. This reads the session from the database rather than only
 * checking that a cookie exists: most pages rely on it, and layouts don't re-run on navigation.
 * Server actions and the data layer check again.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needs = path.startsWith("/admin") ? "headmaster" : path.startsWith("/teacher") ? "teacher" : null;

  const redirectTo = (to: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = search;
    return NextResponse.redirect(url);
  };

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await resolveSession(getDatabase(), token) : null;
  const role = user?.profile.role;

  if (needs) {
    if (!role) return redirectTo("/login", `?next=${encodeURIComponent(path)}`);
    if (role !== needs) return redirectTo(role === "headmaster" ? "/admin" : "/teacher");
  }
  if (path === "/login" && role) return redirectTo(role === "headmaster" ? "/admin" : "/teacher");
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/login"],
};
