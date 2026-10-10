import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;
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
