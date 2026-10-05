import { NextResponse } from "next/server";

const LEGACY_COOKIE = "bot_dashboard_session";

export function middleware(request) {
  const response = NextResponse.next();
  if (request.cookies.has(LEGACY_COOKIE)) {
    response.cookies.set({
      name: LEGACY_COOKIE,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
