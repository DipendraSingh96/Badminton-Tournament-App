import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keeps the organiser's session fresh and guards the planner: `/plan` needs a
 * session (otherwise the sign-in page), and the sign-in page with a session
 * goes straight to the planner. This is a convenience, not the protection:
 * what a user can read and write is decided by row level security in Supabase.
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
        setAll(cookiesToSet) {
          // A refreshed session: passed on to the page being rendered and back to the browser.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Checks the session's signature (and refreshes it when it is about to run out).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const to = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Any refreshed session goes with the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!signedIn && pathname.startsWith("/plan")) return to("/login");
  if (signedIn && pathname === "/login") return to("/plan");
  return response;
}

export const config = {
  matcher: ["/plan/:path*", "/login"],
};
