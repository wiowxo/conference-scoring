import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = getSessionFromRequest(req);

  // Redirect logged-in users away from /login
  if (pathname === "/login") {
    if (session?.role === "organizer") {
      return NextResponse.redirect(new URL("/organizer/dashboard", req.url));
    }
    if (session?.role === "jury") {
      return NextResponse.redirect(new URL("/jury/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Protect organizer routes
  if (pathname.startsWith("/organizer")) {
    if (!session || session.role !== "organizer") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Protect jury routes
  if (pathname.startsWith("/jury")) {
    if (!session || session.role !== "jury") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/organizer/:path*", "/jury/:path*"],
};
