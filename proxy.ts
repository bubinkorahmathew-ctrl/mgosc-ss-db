import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie and guards /admin and /teacher by role.
 * Role + active flag are read from public.profiles (the same source RLS uses), so
 * proxy, layouts and the database always agree. Layouts and server actions re-check.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  // getClaims() verifies the JWT; never authorize from getSession().
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  let role: "headmaster" | "teacher" | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles").select("role, active").eq("id", userId).maybeSingle();
    if (profile?.active) role = profile.role as "headmaster" | "teacher";
  }

  const path = request.nextUrl.pathname;
  const redirectTo = (to: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = search;
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };
  const home = (r: "headmaster" | "teacher") => (r === "headmaster" ? "/admin" : "/teacher");

  const needs = path.startsWith("/admin") ? "headmaster" : path.startsWith("/teacher") ? "teacher" : null;
  if (needs) {
    if (!userId) return redirectTo("/login", `?next=${encodeURIComponent(path)}`);
    if (!role) return redirectTo("/login", "?reason=inactive");
    if (role !== needs) return redirectTo(home(role));
  }
  if (path === "/login" && role) return redirectTo(home(role));
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/login"],
};
