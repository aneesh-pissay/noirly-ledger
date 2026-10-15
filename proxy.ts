import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { consumeRateLimit } from "@/src/server/security/rate-limit";

/** Requests that prove themselves another way: a Bearer token, or a signed webhook. */
function selfAuthenticated(request: NextRequest) {
  return (
    /^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "") ||
    request.nextUrl.pathname === "/api/identity/account-deleted"
  );
}

function configuredOrigin(value: string | undefined) {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

/**
 * Cookie-authenticated changes must come from this app's own pages: same
 * origin, and the header only our scripts send (a cross-site form can't).
 */
function csrfRejection(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  const fail = () => NextResponse.json({ error: "csrf_failed" }, { status: 403 });
  const origin = request.headers.get("origin");
  const expected = configuredOrigin(process.env.AUTH_URL) || request.nextUrl.origin;
  if (origin && origin !== expected) return fail();
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail();
  if (request.headers.get("x-noirly-csrf") !== "1") return fail();
  return null;
}

export const proxy = auth(async (request) => {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    if (!selfAuthenticated(request)) {
      const rejection = csrfRejection(request);
      if (rejection) return rejection;
    }
    try {
      const ip =
        request.headers.get(process.env.TRUSTED_CLIENT_IP_HEADER ?? "x-forwarded-for")?.split(",").at(-1)?.trim() ??
        "unknown";
      const limit = await consumeRateLimit(`ledger-api:${ip}`, 300, 60);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "rate_limited", message: "Too many requests. Try again shortly." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
        );
      }
    } catch {
      return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
    }
  }
  const isLanding = pathname === "/";
  // Readable without an account (Google Play links to the privacy policy).
  const isPublicPage = pathname === "/privacy";
  const isLogin = pathname === "/login";
  const isLoginPopup =
    pathname === "/login/popup" || pathname === "/login/popup-complete";
  const isAuthApi = pathname.startsWith("/api/auth");
  // API routes authenticate themselves (cookie, or Bearer from the mobile app);
  // redirecting them to /login would answer the app with an HTML page.
  const isApi = pathname.startsWith("/api/");

  if (!request.auth && !isLanding && !isPublicPage && !isLogin && !isLoginPopup && !isAuthApi && !isApi) {
    const login = new URL("/login", request.nextUrl.origin);
    if (pathname.startsWith("/invite/")) {
      login.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(login);
  }

  if (request.auth && isLogin) {
    const next = request.nextUrl.searchParams.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return NextResponse.redirect(new URL(next, request.nextUrl.origin));
    }
    return NextResponse.redirect(new URL("/home", request.nextUrl.origin));
  }

  if (request.auth && isLanding) {
    const last = request.cookies.get("nl_last_workspace")?.value;
    if (last && /^[a-f0-9]{24}$/i.test(last)) {
      return NextResponse.redirect(new URL(`/w/${last}`, request.nextUrl.origin));
    }
    return NextResponse.redirect(new URL("/home", request.nextUrl.origin));
  }

  if (request.auth && pathname.startsWith("/w/")) {
    const workspaceId = pathname.split("/")[2];
    if (workspaceId && /^[a-f0-9]{24}$/i.test(workspaceId)) {
      const response = NextResponse.next();
      response.cookies.set("nl_last_workspace", workspaceId, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
