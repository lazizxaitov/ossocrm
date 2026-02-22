import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/session-token";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await verifySessionToken(token);
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/warehouse/:path*",
    "/stock/:path*",
    "/products/:path*",
    "/categories/:path*",
    "/vanities/:path*",
    "/containers/:path*",
    "/clients/:path*",
    "/sales/:path*",
    "/investors/:path*",
    "/investor/:path*",
    "/audit/:path*",
    "/financial-periods/:path*",
    "/inventory-sessions/:path*",
  ],
};
