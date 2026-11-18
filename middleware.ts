import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Routes that require an authenticated session.
 * Any request whose pathname starts with one of these prefixes will be
 * redirected to /auth/sign-in when no valid session exists.
 */
const PROTECTED_PREFIXES = ["/app", "/keeper"];

export async function middleware(request: NextRequest) {
  // Without a configured Supabase project there is no session to refresh and
  // no user to check — `createServerClient` would throw on empty env vars.
  // Let the request through unprotected (dev-only state; auth pages show a
  // "not configured" notice in this case).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  // Start with the unmodified response; the cookie handler below will clone
  // it into a mutable version if any Set-Cookie headers must be added.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write updated cookies back to the request so other middleware can
        // read the refreshed session.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        // Replace the response with one that carries the new cookies.
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: `getUser()` refreshes the session if the access token is
  // expired. Do not remove this call — it is what keeps sessions alive.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtected && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/auth/sign-in";
    // Preserve the original destination so we can redirect back after sign-in.
    signInUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico   (favicon)
     * - public assets (files with an extension: .svg, .png, …)
     *
     * This keeps the matcher efficient while still covering all app routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
