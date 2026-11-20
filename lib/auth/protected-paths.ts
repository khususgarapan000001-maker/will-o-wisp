/**
 * Which paths need a signed-in session (used by middleware.ts).
 *
 * `/keeper/invite/<token>` is the public invite landing page: the keeper has no
 * account yet, and the token in the URL is the credential. Everything else
 * under /keeper (their home, the release decision page, post-release access)
 * requires a session.
 */

export const PROTECTED_PREFIXES = ["/app", "/keeper"] as const;

export function isProtectedPath(pathname: string): boolean {
  if (pathname === "/keeper/invite" || pathname.startsWith("/keeper/invite/")) return false;
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
